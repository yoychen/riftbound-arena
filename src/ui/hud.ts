/**
 * 底部的狀態列：英雄資訊、血量、技能冷卻、金幣與巨獸倒數。
 */
import { HEROES } from "../data/heroes.js";
import { clamp, clock } from "../core/vec.js";
import type { World } from "../core/world.js";
import { $ } from "../render/renderer.js";

/**
 * HUD 每幀都會更新，但大多數值一秒才變一次（時鐘、金幣），有些整局都不變。
 * 原本每幀重寫 innerHTML、重跑 querySelectorAll，會讓瀏覽器每幀重新解析
 * 與排版。改成快取節點、記住上次寫入的值，只有變了才碰 DOM。
 *
 * 這些節點只有 hud.ts 會寫，所以快取的值一定與畫面一致。
 */
const nodes = new Map<string, HTMLElement>();
function node(id: string): HTMLElement {
  let el = nodes.get(id);
  if (!el) nodes.set(id, (el = $(id)));
  return el;
}

const written = new Map<string, string>();
/** 值與上次寫入相同就跳過。`key` 要能區分同一節點的不同屬性。 */
function put(key: string, value: string, write: (value: string) => void) {
  if (written.get(key) === value) return;
  written.set(key, value);
  write(value);
}
const text = (id: string, value: string) =>
  put(id + ".text", value, (v) => (node(id).textContent = v));
const html = (id: string, value: string) =>
  put(id + ".html", value, (v) => (node(id).innerHTML = v));

/** 技能冷卻遮罩。技能列重建時一併重抓。 */
let coolNodes: HTMLElement[] = [];

/**
 * 依所選英雄重建技能列。
 * @param onCast 點擊或按下技能格時要施放哪一格
 */
export function buildSkills(world: World, onCast: (slot: number) => void) {
  const h = HEROES[world.player!.hero];
  $("heroBadge").textContent = h.icon;
  $("heroName").textContent = h.name;
  $("skills").innerHTML = [...h.skills, "閃避"]
    .map(
      (name, i) =>
        `<button class="skill ${i === 2 ? "ultimate" : ""}" data-skill="${i}" title="${name}（${["Q", "E", "R", "空白鍵"][i]}）"><kbd>${["Q", "E", "R", "␣"][i]}</kbd><span class="symbol">${[...h.symbols, "»"][i]}</span><small>${name}</small><span class="cool" style="display:none"></span></button>`,
    )
    .join("");
  const buttons = skillButtons();
  coolNodes = buttons.map((b) => b.querySelector<HTMLElement>(".cool")!);
  // 新的節點，舊的寫入紀錄不再成立。
  for (const key of [...written.keys()]) if (key.startsWith("cool")) written.delete(key);
  buttons.forEach((b) => {
    b.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      onCast(Number(b.dataset.skill));
    };
    // detail 為 0 代表是鍵盤觸發的 click，指標按下時已經處理過了。
    b.onclick = (e) => {
      if (e.detail === 0) onCast(Number(b.dataset.skill));
    };
  });
}

/** 巨獸欄位的標題：現在該注意這隻巨獸的什麼。 */
function bossTitle(world: World): string {
  if (world.capture) return "巢穴收服中";
  const boss = world.boss;
  if (!boss || boss.hp <= 0) return "熔岩龜甦醒";
  if (boss.team < 0) return "熔岩龜已甦醒";
  return boss.team === 0 ? "護送我方熔岩龜" : "攔截敵方熔岩龜";
}

/** 巨獸欄位的副標：收服進度、剩餘生命，或下次甦醒的倒數。 */
function bossStatus(world: World): string {
  const capture = world.capture;
  if (capture) {
    const side = capture.team === 0 ? "我方" : "敵方";
    return `${side} ${Math.min(100, Math.floor((capture.value / 5) * 100))}%`;
  }
  const boss = world.boss;
  if (!boss || boss.hp <= 0)
    return clock(Math.max(0, world.bossAt - world.time));
  if (boss.team < 0) return "中央巢穴 · 爭奪中";
  return `生命 ${Math.ceil(boss.hp)} / ${boss.maxHp}`;
}

/** 技能格。每次重建技能列後重新查詢。 */
const skillButtons = () =>
  [...document.querySelectorAll<HTMLButtonElement>("[data-skill]")];

export function updateHud(world: World) {
  const player = world.player;
  if (!player) return;
  html(
    "score",
    `<b class="blue">${world.scores[0]}</b><span>VS</span><b class="red">${world.scores[1]}</b><i></i><time>${clock(world.time)}</time>`,
  );
  text("level", `LV. ${player.level}`);
  // 取到小數一位：否則浮點尾數每幀都不同，快取形同虛設。
  put(
    "healthFill.width",
    clamp((player.hp / player.maxHp) * 100, 0, 100).toFixed(1) + "%",
    (v) => (node("healthFill").style.width = v),
  );
  text(
    "healthText",
    `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}${player.shield > 0 ? " ＋" + Math.ceil(player.shield) : ""}`,
  );
  text("gold", "◈ " + Math.floor(world.gold));
  coolNodes.forEach((c, i) => {
    const cd = player.cd[i];
    put(`cool${i}.display`, cd > 0.05 ? "grid" : "none", (v) => (c.style.display = v));
    put(`cool${i}.text`, String(Math.ceil(cd)), (v) => (c.textContent = v));
  });
  text("bossTitle", bossTitle(world));
  text("bossTime", bossStatus(world));
  html(
    "respawn",
    player.hp <= 0
      ? `重返戰場<br><b style="font-size:48px">${Math.ceil(Math.max(0, player.dead))}</b>`
      : "",
  );
}
