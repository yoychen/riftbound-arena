/**
 * 底部的狀態列：英雄資訊、血量、技能冷卻、金幣與巨獸倒數。
 */
import { HEROES } from "../data/heroes.js";
import { clamp, clock } from "../core/vec.js";

const $ = (id) => document.getElementById(id);

/**
 * 依所選英雄重建技能列。
 * @param onCast 點擊或按下技能格時要施放哪一格
 */
export function buildSkills(world, onCast) {
  const h = HEROES[world.player.hero];
  $("heroBadge").textContent = h.icon;
  $("heroName").textContent = h.name;
  $("skills").innerHTML = [...h.skills, "閃避"]
    .map(
      (name, i) =>
        `<button class="skill ${i === 2 ? "ultimate" : ""}" data-skill="${i}" title="${name}（${["Q", "E", "R", "空白鍵"][i]}）"><kbd>${["Q", "E", "R", "␣"][i]}</kbd><span class="symbol">${[...h.symbols, "»"][i]}</span><small>${name}</small><span class="cool" style="display:none"></span></button>`,
    )
    .join("");
  document.querySelectorAll("[data-skill]").forEach((b) => {
    b.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      onCast(+b.dataset.skill);
    };
    b.onclick = (e) => {
      if (e.detail === 0) onCast(+b.dataset.skill);
    };
  });
}

export function updateHud(world) {
  if (!world.player) return;
  $("score").innerHTML =
    `<b class="blue">${world.scores[0]}</b><span>VS</span><b class="red">${world.scores[1]}</b><i></i><time>${clock(world.time)}</time>`;
  $("level").textContent = `LV. ${world.player.level}`;
  $("healthFill").style.width =
    clamp((world.player.hp / world.player.maxHp) * 100, 0, 100) + "%";
  $("healthText").textContent =
    `${Math.ceil(Math.max(0, world.player.hp))} / ${world.player.maxHp}${world.player.shield > 0 ? " ＋" + Math.ceil(world.player.shield) : ""}`;
  $("gold").textContent = "◈ " + Math.floor(world.gold);
  document.querySelectorAll("[data-skill]").forEach((b, i) => {
    const c = b.querySelector(".cool");
    c.style.display = world.player.cd[i] > 0.05 ? "grid" : "none";
    c.textContent = Math.ceil(world.player.cd[i]);
  });
  $("bossTitle").textContent = world.capture
    ? "巢穴收服中"
    : world.boss?.hp > 0
      ? world.boss.team < 0
        ? "熔岩龜已甦醒"
        : world.boss.team === 0
          ? "護送我方熔岩龜"
          : "攔截敵方熔岩龜"
      : "熔岩龜甦醒";
  $("bossTime").textContent = world.capture
    ? `${world.capture.team === 0 ? "我方" : "敵方"} ${Math.min(100, Math.floor((world.capture.value / 5) * 100))}%`
    : world.boss?.hp > 0
      ? world.boss.team < 0
        ? "中央巢穴 · 爭奪中"
        : `生命 ${Math.ceil(world.boss.hp)} / ${world.boss.maxHp}`
      : clock(Math.max(0, world.bossAt - world.time));
  $("respawn").innerHTML =
    world.player.hp <= 0
      ? `重返戰場<br><b style="font-size:48px">${Math.ceil(Math.max(0, world.player.dead))}</b>`
      : "";
}
