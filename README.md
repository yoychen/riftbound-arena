# 裂境 RIFTBOUND

可編輯的完整遊戲原始碼與 Git 歷史。此匯出以已上線的第 4 版為基礎，另外整理目錄、格式與資料模組，未發布這次整理到線上遊戲。

## 原始碼說明

遊戲最初以原生 JavaScript、HTML、CSS 撰寫，整份邏輯放在單一個檔案裡。經過一系列重構，現在是 TypeScript 的分層架構：

- `src/core/`：遊戲邏輯。不 import THREE、不碰 DOM，所有測試都打在這一層。
- `src/render/`：THREE 場景、地形、模型、特效、2D 疊層與小地圖。
- `src/ui/`：狀態機、覆蓋層畫面、HUD、提示與音效。
- `src/input/`：鍵盤、滑鼠與觸控。
- `src/main.ts`：把各層接起來，並跑賽局迴圈。
- `art/`：Blender 模型的生成腳本與 `.blend` 原始檔；匯出的 `.glb` 在 `src/assets/models/`。

重構的完整過程與各階段決策見 `docs/refactor-plan.md`。

- `index.html`：遊戲介面與入口。
- `src/game.js`：Three.js 場景、角色模型、戰鬥、AI、路徑、觸控與遊戲循環。
- `src/data/heroes.js`：四位英雄的數值、技能、冷卻與文案。
- `src/data/evolutions.js`：英雄專屬與共通進化。
- `src/styles.css`：完整桌面／手機樣式。
- `src/core/`：純遊戲邏輯，不依賴 THREE 與 DOM，測試都打在這一層。
- `tests/`：Vitest 測試。
- `scripts/smoke-browser.mjs`：Playwright 桌機冒煙檢查。
- `scripts/smoke-touch.mjs`：Playwright 觸控冒煙檢查。
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
npm run smoke       # 瀏覽器冒煙檢查，需另一個終端機先跑 npm run dev
npm run smoke:touch # 觸控裝置的冒煙檢查（搖桿、觸控普攻）
```

## 重建 Blender 模型

模型由腳本生成，要調整形狀時改腳本重跑，不要直接改 `.glb`。需要 Blender 5.2 以上：

```sh
blender --background --factory-startup --python art/build_tree.py
blender --background --factory-startup --python art/build_rock.py
blender --background --factory-startup --python art/build_hero_swordsman.py  # 另有 _archer、_mage、_fighter
```

沒有 Blender 也可以 `pip install bpy==5.2.4`，改用 `python art/build_<名稱>.py` 執行。英雄腳本設 `HERO_PREVIEW=<路徑>.png` 會另外渲染一張多視角預覽圖（Cycles，CPU 即可）。綁了骨架的英雄（目前是逐風劍士，骨架與動作工具在 `art/rig.py`）另可設 `HERO_ANIM_PREVIEW=<路徑>.png` 渲染動作檢查圖。

每支腳本會覆寫 `art/<名稱>.blend` 與 `src/assets/models/<名稱>.glb`。共同的匯出約定（1 單位 = 1 公尺、頂點色只帶明暗、碰撞不從模型推算）寫在 `art/lowpoly.py`，各模型的物件名稱與原點寫在各自腳本開頭。

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
