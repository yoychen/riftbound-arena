/**
 * 瀏覽器冒煙檢查：確認遊戲載入、能進場、模擬有在跑。
 *
 * 單元測試蓋不到 render 與 ui 層的接線，這支腳本補上那一段。
 * 需要先啟動 dev server（npm run dev），再跑 npm run smoke。
 *
 * 外部字型與 favicon 的請求失敗會被忽略，離線環境下屬正常現象。
 */
import { chromium } from "playwright";

const url = process.env.SMOKE_URL || "http://127.0.0.1:8080/";
const ignorable = /fonts\.googleapis\.com|fonts\.gstatic\.com|favicon/i;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  // 網路失敗的 console 訊息不帶 URL，改由 requestfailed / response 追蹤，
  // 這裡只收真正的 JS 例外與自訂錯誤訊息。
  if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
    errors.push(m.text());
});
page.on("requestfailed", (r) => {
  if (!ignorable.test(r.url()))
    errors.push(`請求失敗 ${r.url()} — ${r.failure()?.errorText}`);
});
page.on("response", (r) => {
  if (r.status() >= 400 && !ignorable.test(r.url()))
    errors.push(`HTTP ${r.status()} ${r.url()}`);
});

function check(label, condition, detail) {
  console.log(`${condition ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) errors.push(label);
}

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-hero]", { timeout: 15000 });

const select = await page.evaluate(() => ({
  heroes: document.querySelectorAll("[data-hero]").length,
  start: !!document.getElementById("start"),
  canvas: document.getElementById("world").width > 0,
}));
check("選角畫面有四位英雄", select.heroes === 4, `${select.heroes} 張卡`);
check("有開始按鈕", select.start);
check("WebGL canvas 已配置", select.canvas);

await page.click("#start");
await page.waitForFunction(() => document.getElementById("skills").children.length === 4, { timeout: 10000 });

// 進場的 announce 走的是副作用佇列：邏輯發事件 → drain → 寫 DOM。
// 提示會在 3.4 秒後自動隱藏，所以趁進場當下就取樣。
const toast = await page.evaluate(() => {
  const el = document.getElementById("toast");
  return { shown: el.classList.contains("show"), text: el.textContent.trim() };
});
check("副作用佇列有送達 DOM", toast.shown && toast.text.length > 0, toast.text);

const sample = () =>
  page.evaluate(() => {
    const text = (id) => document.getElementById(id)?.textContent ?? "";
    return {
      clock: text("score").slice(-5),
      health: text("healthText"),
      gold: parseInt(text("gold").replace(/\D/g, ""), 10),
      skills: document.querySelectorAll("[data-skill]").length,
    };
  });

// 右鍵移動：會走一次完整的路徑規劃。
const box = await page.locator("#world").boundingBox();
await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.35, { button: "right" });

// 模擬速度取決於機器與 GPU（軟體 GL 下可能只有真實時間的兩成），所以比較
// 兩次取樣的差值，而不是斷言時鐘走到某個絕對值。
const first = await sample();
await page.waitForTimeout(4000);
const second = await sample();

check("模擬有在前進", second.gold > first.gold, `◈ ${first.gold} → ◈ ${second.gold}`);
check("時鐘有在走", second.clock !== "00:00" || first.clock !== second.clock, `${first.clock} → ${second.clock}`);
check("血量已顯示", /\d+ \/ \d+/.test(second.health), second.health);
check("技能列有四格", second.skills === 4);


await browser.close();
if (errors.length) {
  console.error("\n失敗：\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\n冒煙檢查通過。");
