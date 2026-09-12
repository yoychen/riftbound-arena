/**
 * 疊在 3D 畫面上的 2D 資訊層：血條、單位名稱、傷害數字與集合標記。
 *
 * 用 canvas 而非 DOM，因為要跟著世界座標每幀重畫幾十個標籤。
 */
import type { World } from "../core/world.js";
import { HEROES } from "../data/heroes.js";
import { clamp } from "../core/vec.js";
import { labelCtx as ctx, screen, W, H } from "./renderer.js";

/** 跳出的傷害數字。生命週期由呈現層保管，模擬只送出事件。 */
interface Floater {
  x: number;
  z: number;
  /** 世界座標的高度，隨壽命上飄。 */
  y: number;
  text: number;
  life: number;
  color: string;
}

let floaters: Floater[] = [];

/** 傷害數字由呈現層自行保管生命週期，模擬只負責說「這裡跳一個數字」。 */
function showDamageNumber(
  x: number,
  z: number,
  text: number,
  color: string,
) {
  floaters.push({ x, z, y: 2.8, text, life: 0.8, color });
}

/** 依 dt 推進傷害數字並回收過期的。 */
export function stepFloaters(dt: number, animate: boolean) {
  if (animate) floaters.forEach((f) => (f.life -= dt));
  floaters = floaters.filter((f) => f.life > 0);
}

/** 換局時清掉殘留的傷害數字。 */
export function clearFloaters() {
  floaters = [];
}

export function drawLabels(world: World, state: string) {
  ctx.clearRect(0, 0, W, H);
  if (state === "select") return;
  for (const e of world.entities) {
    if (e.hp <= 0) continue;
    const p = screen(
      e.x,
      e.type === "core"
        ? 6
        : e.type === "tower"
          ? 5.4
          : e.type === "boss"
            ? 4.2
            : 3.1,
      e.z,
    );
    if (!p.visible || p.x < -100 || p.x > W + 100 || p.y < 65 || p.y > H + 20)
      continue;
    let w = e.type === "minion" ? 25 : e.type === "hero" ? 55 : 76;
    ctx.fillStyle = "#0a1e24dc";
    ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 7);
    ctx.fillStyle =
      e.team < 0 ? "#edb66e" : e.team === 0 ? "#7ce1d1" : "#ee9390";
    ctx.fillRect(p.x - w / 2, p.y, w * clamp(e.hp / e.maxHp, 0, 1), 5);
    if (e.shield > 0) {
      ctx.fillStyle = "#f1e4b6";
      ctx.fillRect(
        p.x - w / 2,
        p.y + 6,
        w * clamp(e.shield / e.maxHp, 0, 1),
        2,
      );
    }
    if (e.type !== "minion") {
      ctx.font = `${e.isPlayer ? "bold " : ""}11px 'Noto Sans TC',sans-serif`;
      ctx.textAlign = "center";
      ctx.shadowColor = "#07201b";
      ctx.shadowBlur = 5;
      ctx.fillStyle = e.isPlayer ? "#fff7c7" : "#f1f4e6";
      ctx.fillText(
        e.type === "hero"
          ? `${e.isPlayer ? "▼ 你" : HEROES[e.hero].name}  ${e.level}`
          : e.type === "core"
            ? "核心"
            : e.type === "boss"
              ? e.team < 0
                ? "熔岩龜 · 中立巨獸"
                : "攻城熔岩龜"
              : "防禦塔",
        p.x,
        p.y - 6,
      );
      ctx.shadowBlur = 0;
      if (e.slow > 0 || e.stun > 0) {
        ctx.fillStyle = "#bdefff";
        ctx.fillText(e.stun > 0 ? "暈眩" : "緩速", p.x, p.y - 23);
      }
    }
  }
  for (const f of floaters) {
    const p = screen(f.x, f.y + (1 - f.life) * 2, f.z);
    ctx.globalAlpha = clamp(f.life * 2, 0, 1);
    ctx.font = "bold 17px Space Grotesk,sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = f.color;
    ctx.strokeStyle = "#24352a";
    ctx.lineWidth = 2;
    const text = String(f.text);
    ctx.strokeText(text, p.x, p.y);
    ctx.fillText(text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  if (world.ping && world.time < world.ping.until) {
    const p = screen(world.ping.x, 0.4, world.ping.z);
    ctx.strokeStyle = "#ffe2a2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13 + Math.sin(world.time * 5) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffe2a2";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("集合", p.x, p.y - 22);
  }
}

export { showDamageNumber };
