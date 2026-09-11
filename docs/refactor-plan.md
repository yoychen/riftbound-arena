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
| 5 | skills 技能表資料化 + ai | skills：各技能的傷害／位移／CD | |
| 6 | render / ui / input 拆檔 | 手動驗證為主 | |
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

1. **`planPath()` 效能** — 階段 1 已把格點通行表改成建構期快取的 `Uint8Array`，
   但**實測顯示這不是瓶頸**：360 個障礙物、30 次規劃，重構前 652 ms、重構後
   682 ms，沒有可量測的差異。真正的成本在 A* 展開節點時，每條邊都要跑一次
   `walkableSegment`，而它是對**全部**障礙物做線性掃描 —— 約
   1000 節點 × 8 鄰居 × 360 障礙物 ≈ 290 萬次距離計算，單次規劃約 22 ms，
   足以造成一次明顯掉幀。
   正確的修法是把障礙物放進空間雜湊（以格子分桶），讓 `walkableSegment`
   只檢查線段經過的那幾格。A* 的 open set 改成 binary heap 是次要的。
2. **`updateHud()` 每幀重寫 innerHTML** 並重跑 `querySelectorAll`。應快取節點、
   髒值才寫。
3. **`damage()` 無敵判定順序錯誤** — `invuln` 檢查在 reflect 之後，導致對閃避中的
   敵人攻擊仍會觸發反傷與特效。應移到函式最前面。
4. **核心保護條件是三層雙重否定** — 邏輯正確但無法閱讀，應抽成
   `isCoreShielded(team)`。
5. **`clearBattle()` 沒有 dispose geometry** — 連續重開多局會累積 GPU 記憶體。
6. **投射物碰撞在 `dt === 0` 時產生 NaN** — 該幀命中判定靜默失效。
7. **`move()` 碰撞推擠只做一次** — 密林區可能被推進另一棵樹。
8. **`enemies()`/`targetFor()` 每幀 O(n²) 配置** — 應改就地迴圈。
9. **進化 id `bounce` 跨英雄重複**（射手連鎖飛矢／法師電弧法球）。目前無害，
   因為一局只取單一英雄的池，但讓「id 全域唯一」假設失效。
10. **起點卡在障礙物內時 `planPath()` 回傳空陣列** — 路徑平滑要求「從起點看得見
    第一個節點」，在障礙物內部無法滿足，遊戲會誤報「這個位置無法抵達」。與 #7
    的單次推擠相加，玩家有機會卡進樹裡後完全無法用右鍵移動。修法是平滑失敗時
    退回逐格路徑，或先把起點投影到最近的可站立點。
    現況記錄於 `tests/navigation.test.ts`。

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
