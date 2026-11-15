/**
 * 觸控裝置的瀏覽器冒煙檢查。
 *
 * 桌機版的 smoke-browser.mjs 完全不碰搖桿與觸控普攻，而那條路徑有自己的
 * 事件處理。階段 6 拆檔時把搖桿搬進 input/，`clamp` 的 import 卻沒跟著搬 ——
 * 手機上一拖搖桿就拋 ReferenceError，移動完全失效，而桌機檢查照樣全過。
 *
 * 需要先啟動 dev server（npm run dev），再跑 npm run smoke:touch。
 */
import { chromium } from "playwright";

const url = process.env.SMOKE_URL || "http://127.0.0.1:8080/";
const ignorable = /fonts\.googleapis\.com|fonts\.gstatic\.com|favicon/i;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
// 有觸控、直式手機尺寸：matchMedia("(pointer:coarse)") 會成立，
// 遊戲因此切換到搖桿操作與自動瞄準。
const context = await browser.newContext({
  hasTouch: true,
  isMobile: true,
  viewport: { width: 420, height: 860 },
});
const page = await context.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error" && !/Failed to load resource/.test(m.text()))
    errors.push(m.text());
});
page.on("requestfailed", (r) => {
  if (!ignorable.test(r.url()))
    errors.push(`請求失敗 ${r.url()} — ${r.failure()?.errorText}`);
});

function check(label, ok, detail) {
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) errors.push(label);
}

/** 從小地圖的像素找出玩家：玩家點是整張圖唯一的 #fff2b6。 */
const playerSpot = () =>
  page.evaluate(() => {
    const c = document.getElementById("minimap");
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let sx = 0, sy = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r > 245 && g > 235 && g < 250 && b > 170 && b < 200) {
        const p = i / 4;
        sx += p % c.width;
        sy += Math.floor(p / c.width);
        n++;
      }
    }
    return n ? { x: sx / n, y: sy / n } : null;
  });

await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-hero]", { timeout: 15000 });
// 暮光法師的三個技能都能拖曳（方向、落點、落點），拖曳瞄準的檢查才測得到。
await page.tap('[data-hero="2"]');
await page.tap("#start");
await page.waitForFunction(
  () => document.getElementById("skills").children.length === 4,
  { timeout: 10000 },
);

const hint = await page.evaluate(
  () => document.querySelector(".start-help")?.textContent ?? "",
);
check("已切換到觸控操作說明", /搖桿/.test(hint) || hint === "", hint.slice(0, 20));

// 拖曳搖桿，並用小地圖確認角色真的移動了。
const before = await playerSpot();
check("小地圖上找得到玩家", before !== null, before && `(${before.x.toFixed(0)}, ${before.y.toFixed(0)})`);

const stick = await page.locator("#touchMove").boundingBox();
const cx = stick.x + stick.width / 2;
const cy = stick.y + stick.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 34, cy - 24, { steps: 6 });
await page.waitForTimeout(2500);
await page.mouse.up();

const after = await playerSpot();
const moved = before && after ? Math.hypot(after.x - before.x, after.y - before.y) : 0;
// 軟體 GL 下模擬只跑真實時間的一小部分，門檻取寬鬆值。
check("拖曳搖桿會讓角色移動", moved > 1.5, `${moved.toFixed(1)} 個小地圖像素`);

// 觸控普攻
await page.tap("#touchAttack");
await page.waitForTimeout(500);
check("觸控普攻沒有拋錯", errors.length === 0);

// 技能格用點的
await page.locator("[data-skill]").first().tap();
await page.waitForTimeout(600);
const cooling = await page.evaluate(() =>
  [...document.querySelectorAll(".cool")].some((c) => c.style.display === "grid"),
);
check("點擊技能格會進入冷卻", cooling);

// 按住技能格拖曳瞄準。page.mouse 送的是滑鼠事件，要用 CDP 送真的觸控，
// 瀏覽器才會產生 pointerType 為 touch 的指標事件。
const cdp = await context.newCDPSession(page);
const touch = (type, x, y) =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 7 }],
  });
const slotCooling = (slot) =>
  page.evaluate(
    (slot) => document.querySelectorAll(".cool")[slot].style.display === "grid",
    slot,
  );
async function dragSkill(slot, to) {
  const box = await page.locator(`[data-skill="${slot}"]`).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await touch("touchStart", x, y);
  await page.waitForTimeout(50);
  const target = await to(x, y); // 取消區要按下之後才出現，量位置要在這之後
  for (let i = 1; i <= 6; i++)
    await touch("touchMove", x + ((target.x - x) * i) / 6, y + ((target.y - y) * i) / 6);
  await page.waitForTimeout(200);
  const during = await page.evaluate(() => ({
    cancel: document.getElementById("aimCancel").className,
    aiming: !!document.querySelector(".skill.aiming"),
  }));
  await touch("touchEnd", target.x, target.y);
  await page.waitForTimeout(400);
  return during;
}

const aimed = await dragSkill(1, (x, y) => ({ x: x - 90, y: y - 60 }));
check("拖曳技能時出現瞄準狀態與取消區", aimed.aiming && /show/.test(aimed.cancel), aimed.cancel);
check("拖曳後放開會施放技能", await slotCooling(1));

const cancelled = await dragSkill(2, async () => {
  const zone = await page.locator("#aimCancel").boundingBox();
  return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
});
check("拖到取消區時取消區會亮起", /hot/.test(cancelled.cancel), cancelled.cancel);
check("在取消區放開不會施放", !(await slotCooling(2)));
check("放開後取消區收起", !(await page.evaluate(() => document.getElementById("aimCancel").classList.contains("show"))));

await browser.close();
if (errors.length) {
  console.error("\n失敗：\n" + errors.join("\n"));
  process.exit(1);
}
console.log("\n觸控冒煙檢查通過。");
