# 裂境 RIFTBOUND

可編輯的完整遊戲原始碼與 Git 歷史。此匯出以已上線的第 4 版為基礎，另外整理目錄、格式與資料模組，未發布這次整理到線上遊戲。

## 原始碼說明

遊戲最初直接以原生 JavaScript、HTML、CSS 撰寫，沒有 TypeScript、React、編譯前模板或 source map。舊提交把手寫原始碼放在 dist/，且排版過度壓縮；後續提交將它搬到 src/ 並重新排版。這不是從 bundle 反編譯，也沒有遺漏另一份 src/。

目前正在進行模組化重構：把 `src/game.js` 拆成 `core/`（純邏輯，不依賴 THREE 與 DOM）、`render/`、`ui/`、`input/` 四層，並為 `core/` 補上測試。進度見 `docs/refactor-plan.md`。

- `index.html`：遊戲介面與入口。
- `src/game.js`：Three.js 場景、角色模型、戰鬥、AI、路徑、觸控與遊戲循環。
- `src/data/heroes.js`：四位英雄的數值、技能、冷卻與文案。
- `src/data/evolutions.js`：英雄專屬與共通進化。
- `src/styles.css`：完整桌面／手機樣式。
- `src/core/`：純遊戲邏輯，不依賴 THREE 與 DOM，測試都打在這一層。
- `tests/`：Vitest 測試。
- `scripts/smoke-browser.mjs`：Playwright 瀏覽器冒煙檢查。
- `.git/`：原有 4 筆提交與本次原始碼整理的新增提交。
- `.openai/hosting.json`：原 Sites 識別及靜態輸出設定，一般靜態主機不需要它。

## 本機執行

需要 Node.js 20 以上。

```sh
npm install
npm run dev
```

開啟 http://localhost:8080 。Vite 提供 HMR，存檔即更新。Google Fonts 無法連線時會使用系統字型。

## 測試

```sh
npm test          # 跑一次
npm run test:watch
npm run typecheck # tsc --noEmit
npm run smoke     # 瀏覽器冒煙檢查，需另一個終端機先跑 npm run dev
```

## 輸出靜態網站

```sh
npm run build
npm run preview
```

Vite 會輸出 bundled、minified 的 dist/。部署時使用 dist/ 內容；日常修改請編輯 src/。

## 推到自己的 Git server

先建立空 repository，不要預先新增 README。將以下 URL 替換為自己的 Git server URL：

```sh
git status
git log --oneline --all
git remote add origin <YOUR_GIT_REPOSITORY_URL>
git push -u origin main
git push origin --tags
```

不用重新 git init。main 的所有歷史會一起推送，目前沒有 tags。匯出副本沒有遠端或認證設定，請使用自己的 SSH key 或 Git credential manager。

## 歷史範圍

原本四筆提交完整保留，包括初版、右鍵移動、WASD 與右鍵共存、手機多指修正。第五筆是本次匯出整理；不是補造的早期開發紀錄。不包含對話或每次尚未提交的修改。
