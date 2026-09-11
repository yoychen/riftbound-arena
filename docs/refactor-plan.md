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

### 一、`entity.model` 必須從邏輯中消失

目前 `ai()`、`attack()`、`cast()` 都在寫 `e.model.rotation.y`，`kill()` 在寫
`e.model.visible`。改成 entity 持有純數字 `facing`、純布林 `alive`，由
`render/sync.ts` 單向讀取。全檔共 31 處 `.model.` 引用，真正的耦合點約 10 個。

### 二、副作用改走事件佇列

`combat.ts` 不能呼叫 `ringFx()`（會拉進 THREE）也不能呼叫 `announce()`（會拉進
DOM）。改成推事件，每幀由 render / ui / audio 各自 drain：

```js
world.events.push({ type: "ring", x, z, r, color });
world.events.push({ type: "announce", text: "擊敗英雄！＋110 金幣" });
world.events.push({ type: "sound", freq: 760, dur: 0.14 });
```

副作用一旦變成資料，`damage()` 就能在 Node 裡直接斷言行為。

## 階段

| 階段 | 內容 | 測試產出 | 狀態 |
|---|---|---|---|
| 0 | Vite + Vitest 進場，vendor/three → three@0.180，scripts/*.mjs 退役 | 冒煙測試 | ✅ |
| 1 | 抽 vec / rng / navigation | navigation 13 項：直線可走、繞障礙、缺口穿越、不可達回空、平滑後節點數下降、通行表只算一次 | ✅ |
| 2 | **解耦手術**：facing 欄位 + 事件佇列 | 事件佇列快照 | |
| 3 | World 容器，module-level let 全部收編 | createWorld() fixture | |
| 4 | entities / targeting / combat | combat：護盾吸收、無敵、核心保護、反傷、處決、leech、塔仇恨 | |
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

## 等價性驗證

階段 1 的搬遷以差異比對驗證過：從 `f39797f` 原文擷取重構前的 `seeded`、
`walkableSegment`、`planPath`，與新模組在同樣輸入下逐一比對。

- 亂數序列：200000 個值，不一致 0 個（地形因此完全相同）
- 路徑規劃：3000 組隨機查詢（1573 組需要繞路、433 組雙方都判定不可達），
  輸出路徑不一致 0 組

比對腳本是一次性的，未納入版控；要重跑的話從 git 歷史重新擷取即可。
