# 模組化重構計畫

把 `src/game.js`（2340 行）拆成可測試的分層架構，逐步進行，每階段結束遊戲都必須可玩。

## 核心原則

**`core/` 不 import THREE、不碰 `document`。**

這是讓遊戲邏輯變成可測試的唯一關鍵，其餘結構都是為它服務。

## 目標結構

```
src/
├─ main.ts                 組裝層：建 world、接 renderer/ui/input、跑 loop
│
├─ config/
│  ├─ balance.ts           魔術數字：傷害倍率、金幣、波次間隔、進化時點
│  └─ map.ts               地圖邊界、路線控制點、基地座標、河流
│
├─ data/                   heroes / evolutions（沿用現有）
│
├─ core/                   純邏輯，測試主戰場
│  ├─ types.ts             Entity / World / GameEvent
│  ├─ rng.ts               seeded LCG，可注入 → 模擬可重現
│  ├─ vec.ts               dist / clamp / normalize
│  ├─ world.ts             World 容器（收攏目前的 module-level let）
│  ├─ entities.ts          createUnit + 單位原型表
│  ├─ navigation.ts        障礙格點（載入時預算）、walkableSegment、planPath
│  ├─ movement.ts          move / dash / 碰撞推擠
│  ├─ targeting.ts         enemies / targetFor
│  ├─ combat.ts            damage / kill / 護盾 / 免疫
│  ├─ skills.ts            技能表
│  ├─ ai.ts                決策樹
│  ├─ match.ts             波次、boss、收服、進化時點、勝負條件
│  └─ simulate.ts          step(world, dt) — 唯一模擬入口
│
├─ render/                 只讀 world，絕不改 world
│  ├─ renderer.ts  terrain.ts  models.ts
│  ├─ sync.ts              world → scene 的增刪與 transform 同步
│  ├─ effects.ts           消費事件佇列產生特效
│  ├─ labels.ts            2D overlay 血條／傷害數字
│  └─ minimap.ts
│
├─ ui/    hud.ts  screens.ts  feed.ts  mcpTools.ts
├─ input/ keyboard.ts  pointer.ts  touch.ts
└─ styles/
```

## 兩個關鍵的解耦手術

### 一、`entity.model` 必須從邏輯中消失 ✅

`ai()`、`attack()`、`cast()` 原本直接寫 `e.model.rotation.y`，`kill()` 直接寫
`e.model.visible`。現在實體只持有純數字 `facing`，可見性由 `hp > 0` 推導，
兩者都在 `syncModels(dt)` 這一遍裡單向套用到模型上。

`syncModels` 刻意放在 `update()` 的最尾端、所有傷害結算與實體清理之後，
這樣當幀死亡的單位當幀就會隱藏，與原本 `kill()` 立即設 `visible = false`
的時機一致。

### 二、副作用改走事件佇列

`combat.ts` 不能呼叫 `ringFx()`（會拉進 THREE）也不能呼叫 `announce()`（會拉進
DOM）。改成推事件，每幀由 render / ui / audio 各自 drain：

```js
world.events.push({ type: "ring", x, z, r, color });
world.events.push({ type: "announce", text: "擊敗英雄！＋110 金幣" });
world.events.push({ type: "sound", freq: 760, dur: 0.14 });
```

副作用一旦變成資料，`damage()` 就能在 Node 裡直接斷言行為。

已完成：`ringFx` / `burst` / `announce` / `feed` / `tone` 這五個名字現在是發射器，
原本的實作改名為 `playRing` / `playBurst` / `showAnnounce` / `showFeed` /
`playTone`，集中由 `handleEvent` 派送。47 個呼叫端一行未改。

取用時機在 `frame()` 而非 `update()`，因為輸入處理與 UI 也會發事件，而
`update()` 在非遊玩狀態會提前返回。換局時 `setupBattle()` 會 `clear()`，
避免上一局殘留的事件在新戰場冒出來。

## 階段

| 階段 | 內容 | 測試產出 | 狀態 |
|---|---|---|---|
| 0 | Vite + Vitest 進場，vendor/three → three@0.180，scripts/*.mjs 退役 | 冒煙測試 | ✅ |
| 1 | 抽 vec / rng / navigation | navigation 13 項：直線可走、繞障礙、缺口穿越、不可達回空、平滑後節點數下降、通行表只算一次 | ✅ |
| 2 | **解耦手術**：facing 欄位 + 事件佇列 + syncModels | 事件佇列 4 項、架構邊界守門 9 項 | ✅ |
| 3 | World 容器，module-level let 全部收編；傷害數字改走事件 | world 3 項 | ✅ |
| 4 | entities / targeting / combat | combat 25、kill 15、targeting 9、entities 7 | ✅ |
| 5 | skills 技能表資料化 + ai + movement | skills 28、ai 27、movement 12 | ✅ |
| 6 | render / ui / input 拆檔 | 瀏覽器輸入層檢查 9 項 | ✅ |
| 7 | 修既知問題（見下） | 迴歸測試護網已就位 + 差異比對 | |
| 8 | 逐檔 .js → .ts，由 core/ 開始 | tsc --noEmit 進 CI | |

階段 2 是樞紐也是唯一的危險點：它之前無法寫有意義的測試，它之後每一步都有網子。

## 測試策略

- **核心是模擬測試**：`step(world, dt)` 是純函式，給定 seed 與輸入序列，跑 600 秒
  應得到位元級相同的結果。讓「重構沒有改變行為」可被機器驗證。
- 每抽一個模組，**先為現有行為寫測試（記錄現況，包含 bug）**，搬完跑綠，
  階段 7 再逐一修 bug 並同步更新斷言。這樣才分得清「重構壞掉」與「刻意修正」。
- UI 與 render 不寫單元測試。

## 既知問題（階段 7 處理）

1. ~~**`planPath()` 效能**~~ — 階段 7 以空間索引（`core/obstacleGrid.ts`）解決。
   `walkableSegment` 現在只檢查線段經過的格子，不再掃全圖。實測（360 個障礙物）：

   | 點擊距離 | 修正前 | 修正後 | 倍數 |
   |---|---|---|---|
   | ≤ 8 | 4.0 ms | 0.70 ms | 5.7× |
   | ≤ 25 | 14.1 ms | 0.49 ms | 29× |
   | 跨半張地圖 | 29.7 ms | 3.16 ms | 9.4× |

   全部落在一幀 16.7 ms 的預算內。以 6000 組線段查詢與 480 組路徑規劃對照
   線性掃描驗證，結果完全一致（`tests/obstacleGrid.test.ts`）。
2. **`updateHud()` 每幀重寫 innerHTML** 並重跑 `querySelectorAll`。應快取節點、
   髒值才寫。
3. ~~**`damage()` 無敵判定順序錯誤**~~ — 階段 7 修正。`invuln` 檢查移到函式最前面，
   無敵期間的攻擊現在完全不存在：不反傷、不上緩速、不累積 mark、不吸血、
   不引來塔的仇恨、不產生任何特效。
4. **核心保護條件是三層雙重否定** — 邏輯正確但無法閱讀，應抽成
   `isCoreShielded(team)`。
5. ~~**`clearBattle()` 沒有 dispose geometry**~~ — 階段 7 修正。實測連開六局，
   JS 堆積從 **2.6 MB 線性成長降到 0.2 MB**（量測雜訊範圍內，不再累積）。
   `clearEffects()` 有同樣的問題，一併修正。

   材質大多來自 `mat()` 的共用快取，釋放掉會讓還在場上的單位變黑，所以
   `disposeModel()` 預設只釋放幾何；只有自己 `new` 出來的材質（區域圓盤、
   擴散光環）才傳 `disposeMaterial`。
6. **投射物碰撞在 `dt === 0` 時產生 NaN** — 該幀命中判定靜默失效。
7. ~~**`move()` 碰撞推擠只做一次**~~ — 階段 7 修正。實測密集樹叢中有 **14%** 的
   移動會被推進另一棵樹，比原本估計的「偶爾」嚴重得多。

   逐一硬貼邊緣、最深優先、合成推力三種迭代策略都收斂太慢（十六輪後仍有
   1.75%–2.48% 殘留），因為地形生成沒有檢查樹與樹的間距，樹會互相重疊，
   夾角處會來回震盪。最終採用兩段式：先做四輪便宜的推擠處理常見情況，
   仍重疊時改用環狀搜尋由近而遠找最近的合法落點。殘留率 **0%**。
8. ~~**`enemies()`/`targetFor()` 每幀 O(n²) 配置**~~ — 階段 7 修正，但**效益比預期小**。

   先量了才動手：60 個單位的中後期戰鬥，AI 每幀只花 0.215 ms，約是一幀預算的
   1.3% —— **平均成本根本不是問題**。真正的代價是每秒上百個短命陣列造成的
   GC 停頓。

   改成 `forEachEnemy()` 回呼走訪、`countEnemies()` 只數不收集之後：

   | 指標 | 修正前 | 修正後 | |
   |---|---|---|---|
   | 中位數 | 0.215 ms | 0.203 ms | −6% |
   | p95 | 0.436 ms | 0.339 ms | −22% |
   | p99 | 0.663 ms | 0.535 ms | −19% |
   | 每 1200 幀垃圾 | 3.6 MB | 2.7 MB | −25% |

   尾端的改善明顯大於中位數，符合 GC 壓力的推論。剩下的 2.7 MB 來自 AI 與技能
   路徑上大量的小物件（方向向量、目標點），再壓下去要犧牲可讀性，不划算。
9. **進化 id `bounce` 跨英雄重複**（射手連鎖飛矢／法師電弧法球）。目前無害，
   因為一局只取單一英雄的池，但讓「id 全域唯一」假設失效。
10. ~~**起點卡在障礙物內時 `planPath()` 回傳空陣列**~~ — 階段 7 修正，而真正的
    根因比原本的診斷更深：

    **兩層用了不同的間隙值。** 移動用 `CLEARANCE = 0.48`，路徑規劃用
    `clearance = 0.55`。規劃的間隙比較大是有意的 —— 路徑才不會貼著樹角走 ——
    但代價是**角色擠得進去的縫隙，在格點圖上是封死的**。起點因此會落在一個
    A* 連不出去的口袋裡。

    修法分兩層：路徑平滑失敗時退回未平滑的逐格路徑；A* 完全連不起來時，
    用有界的連通區域大小區分「終點被圍死」（回傳空陣列）與「起點卡在口袋裡」
    （直接朝終點走，讓移動的碰撞滑移把人帶出來 —— 正是玩家改用 WASD 會做的事）。

    `tests/stuck-recovery.test.ts` 驗證走進密集樹叢一千次，每次都還規劃得出路徑。

## 階段 3 的做法：用 AST 而非文字取代

要搬的識別字裡有 `time`、`boss`、`player`、`capture` 這些字，它們同時出現在
字串（`e.type === "boss"`）、物件鍵、成員屬性名裡，正規表示式改不動。

專案裝的 TypeScript 7 是原生移植版，只提供執行檔不提供 JS 編譯器 API，
所以改用 `acorn` 解析 AST，只改寫真正指向模組層變數的 `Identifier` 節點，
並略過成員屬性名、物件鍵與宣告名稱。事前先掃過一遍確認沒有巢狀作用域的
同名遮蔽與簡寫屬性，再套用 261 處改寫。

套用後的驗證：重新解析確認語法正確、重跑 codemod 確認沒有殘留的裸識別字、
比對前後所有字串常值確認沒有一個被誤改（只多出新的 import 路徑與 `"damage"`
事件名）。codemod 腳本是一次性的，未納入版控。

## World 收什麼、不收什麼

收模擬狀態：實體、投射物、區域、玩家、計時、波次、巨獸、收服、比分、
集合指令、金幣與進度、待走路徑。

不收呈現層：`effects`（持有 THREE mesh）、`floaters`、`state`（UI 狀態機）、
`viewTarget`、`toastUntil`、`muted`、`audioCtx`。`tests/world.test.ts` 會斷言
這些名字沒有出現在容器裡 —— 一旦混進來，戰鬥邏輯就又搬不出瀏覽器了。

`state` 刻意留在外面：它決定「要不要推進模擬」，而不是模擬的一部分。

傷害數字原本是 `floaters.push(...)`，寫在 `damage()` 裡。雖然它是純資料不帶
THREE，但屬於呈現層，因此改成 `damage` 事件，由呈現層自行保管生命週期。
這是 `damage()` 搬進核心層前的最後一個依賴。

## 階段 4 的兩項結構調整

**事件佇列移進 World。** 核心層的戰鬥邏輯需要送出特效與提示，把佇列掛在
`world.events` 比多傳一個參數乾淨。它是模擬的「輸出」而非呈現層狀態，
所以不違反 World 的收納原則。

**新增兩個通知事件。** `kill()` 原本直接寫 `mouseDown = false`（輸入狀態）
與呼叫 `endGame()`（UI）。改成送出 `playerDeath` 與 `matchEnd`，由呈現層
決定怎麼反應。

`addUnit` 拆成兩層：核心的 `createUnit` 決定數值與實體結構，`game.js` 的
薄包裝負責掛上模型。原本四個欄位各自寫一串五層巢狀三元運算子，現在是一張
`UNIT_STATS` 表，小兵那一列是函式因為它隨戰鬥時間成長。

`targetFor` 從「排序後取第一個」改成單趟最小值掃描，省下每次呼叫的陣列配置
與排序。這是演算法變更，因此以差異比對驗證：1200 組隨機戰局，新舊實作選出
的目標不一致 0 組。

## 階段 5：Battlefield 注入

`ai` 與 `move` 需要兵線與障礙物，但兩者都是建構場景時的產物。與其把地形
搬進核心層，改成定義 `Battlefield` 介面由呈現層實作並注入：

```ts
interface Battlefield {
  obstacles: readonly Obstacle[];
  navigation: Navigation;
  bases: readonly Point[];
  bounds: { x: number; z: number };
  pointOnLane(lane: number, t: number): Point;
  progressOn(lane: number, point: Point): number;
}
```

`pointOnLane` 刻意不在核心層用取樣點自行內插 —— 那會和原本的
`CatmullRomCurve3.getPoint()` 產生微小差異，兵線走法就不再等價。實作留在
呈現層直接問曲線。

### 技能改成一張表

十二個技能原本寫在 `cast()` 裡四段 `if (e.hero === n)` 的巢狀分支中。現在每個
技能是具名函式，掛在 `HERO_SKILLS[英雄][技能槽]` 上，要查「烈焰印記做什麼」
不必再數分支。

### 瞄準狀態進入 World

`direction()` 與 `cast()` 原本直接讀 `aim`、`coarse`、`pointerKnown` 這些輸入層
變數。改成 `world.aim` 與 `world.autoAim`，由輸入層每幀更新 —— 它們是模擬的
輸入，和 `movePath` 同一類。

`cast()` 原本還檢查 `state !== "playing"`，這是 UI 狀態機。守衛移到呈現層的
`playerCast()`，因為技能按鈕在暫停畫面仍然點得到。

### 投射物與區域不再持有模型

`shoot()` 與 `addZone()` 原本直接建立 THREE 網格。現在它們只把外觀參數
（`big`、`color`、`r`）寫進資料，`syncModels` 看到沒有模型的物件才補上，
與實體的處理方式一致。

## 階段 6：呈現層的拆分

`game.js` 從 1676 行拆成十一個模組，改名為 `main.js` 並成為唯一的組裝點：

```
render/  renderer  terrain  models  effects  labels  minimap
ui/      session  screens  hud  feed  audio
input/   index
main.js  組裝 + 賽局迴圈
```

三個設計決定：

**`session` 是一個可變物件而非模組層的 `let`。** `state` 決定要不要推進模擬，
各層都要讀它；用物件就不需要一堆 getter / setter，也不會有 live binding 的
誤解。它留在 UI 層而不是 world 裡 —— 它是應用程式的狀態，不是戰局的狀態。

**`screens` 與 `input` 用工廠函式。** 畫面需要 `setupBattle`，而戰局組裝又需要
畫面；輸入要呼叫暫停與商店，那些又需要戰局。直接互相 import 會造成循環，
改由 `main.js` 注入回呼。

**輸入狀態放在可變的 `input` 物件裡。** 按著哪些鍵、滑鼠有沒有按住、搖桿推到
哪，都是模擬的輸入，但生命週期屬於輸入層，所以不塞進 world。

### 尚未搬走的部分

`update()` 仍在 `main.js`，它是賽局規則（波次、巨獸甦醒、收服、進化時點、
核心衰減、投射物與區域結算）。抽成 `core/match.ts` 是合理的後續，但不屬於
本階段的範圍。

## 分層守門

`tests/architecture.test.ts` 會掃過 `src/core/` 每一個檔案，確認它們沒有
import 任何帶 `three` 的模組、沒有引用 `document` / `window` / `matchMedia`
等瀏覽器全域物件。這條線靠紀律守不住，讓它在 CI 上直接紅掉比較實際。

## 等價性驗證

階段 1 的搬遷以差異比對驗證過：從 `f39797f` 原文擷取重構前的 `seeded`、
`walkableSegment`、`planPath`，與新模組在同樣輸入下逐一比對。

- 亂數序列：200000 個值，不一致 0 個（地形因此完全相同）
- 路徑規劃：3000 組隨機查詢（1573 組需要繞路、433 組雙方都判定不可達），
  輸出路徑不一致 0 組

比對腳本是一次性的，未納入版控；要重跑的話從 git 歷史重新擷取即可。
