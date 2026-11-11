/**
 * 底部的狀態列：英雄資訊、血量、技能冷卻、金幣與巨獸倒數。
 */
import { HEROES } from "../data/heroes.js";
import { clamp, clock } from "../core/vec.js";
import type { World } from "../core/world.js";
import { $ } from "../render/renderer.js";

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
  skillButtons().forEach((b) => {
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
  $("score").innerHTML =
    `<b class="blue">${world.scores[0]}</b><span>VS</span><b class="red">${world.scores[1]}</b><i></i><time>${clock(world.time)}</time>`;
  $("level").textContent = `LV. ${player.level}`;
  $("healthFill").style.width =
    clamp((player.hp / player.maxHp) * 100, 0, 100) + "%";
  $("healthText").textContent =
    `${Math.ceil(Math.max(0, player.hp))} / ${player.maxHp}${player.shield > 0 ? " ＋" + Math.ceil(player.shield) : ""}`;
  $("gold").textContent = "◈ " + Math.floor(world.gold);
  skillButtons().forEach((b, i) => {
    const c = b.querySelector<HTMLElement>(".cool")!;
    c.style.display = player.cd[i] > 0.05 ? "grid" : "none";
    c.textContent = String(Math.ceil(player.cd[i]));
  });
  $("bossTitle").textContent = bossTitle(world);
  $("bossTime").textContent = bossStatus(world);
  $("respawn").innerHTML =
    player.hp <= 0
      ? `重返戰場<br><b style="font-size:48px">${Math.ceil(Math.max(0, player.dead))}</b>`
      : "";
}
