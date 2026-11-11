/**
 * 所有覆蓋在戰場上的畫面：選角、暫停、商店、進化、巨獸路線與結算。
 *
 * 每一個都會把 `session.state` 切離 "playing"，模擬因此暫停 —— 這就是為什麼
 * 狀態機留在 UI 層而不是 world 裡。
 *
 * 用工廠函式而非直接匯出，是為了避開循環相依：畫面需要 setupBattle，
 * 而戰局組裝也需要畫面。
 */
import { commonUpgrades, heroUpgrades } from "../data/evolutions.js";
import { HEROES } from "../data/heroes.js";
import { clock, dist } from "../core/vec.js";
import { resumeAudio } from "./audio.js";
import type { Point } from "../core/vec.js";
import type { World } from "../core/world.js";
import type { Upgrade } from "../data/evolutions.js";
import { $ } from "../render/renderer.js";
import { session } from "./session.js";

/**
 * @param deps.setupBattle 以指定英雄重置戰局
 * @param deps.updateHud   重畫 HUD
 * @param deps.claimBoss   收服巨獸並指定進攻路線
 * @param deps.resetInput  清空按鍵與滑鼠按住狀態，避免覆蓋層關閉後仍在動作
 * @param deps.coarse      是否為觸控裝置，決定操作說明文字
 */
/** 畫面層需要的外部能力。由 main 注入，避免與戰局組裝互相 import。 */
export interface ScreenDeps {
  world: World;
  /** 兩隊基地座標，判斷玩家在不在自家核心旁才能買裝備。 */
  bases: readonly Point[];
  /** 以指定英雄重置戰局。 */
  setupBattle: (hero: number) => void;
  buildSkills: () => void;
  updateHud: () => void;
  /** 收服巨獸並指定進攻路線。 */
  claimBoss: (team: number, lane: number) => void;
  /** 清空按鍵與滑鼠按住狀態。 */
  resetInput: () => void;
  /** 觸控裝置的操作說明與桌機不同。 */
  coarse: boolean;
}

export function createScreens({
  world,
  bases,
  setupBattle,
  buildSkills,
  updateHud,
  claimBoss,
  resetInput,
  coarse,
}: ScreenDeps) {
  /**
   * 玩家的英雄。
   *
   * 這些覆蓋層只在戰局建立之後才開得起來（選角畫面也會先 setupBattle），
   * 所以這裡必然存在。
   */
  const player = () => world.player!;

  const announce = (text: string) => world.events.emit({ type: "announce", text });
  const tone = (
    freq: number,
    duration = 0.06,
    volume = 0.025,
    wave: "sine" | "triangle" = "sine",
  ) =>
    world.events.emit({ type: "sound", freq, duration, volume, wave });

function upgradePool() {
  let a = [...heroUpgrades[player().hero], ...commonUpgrades];
  if (world.evoIndex === 1 || world.evoIndex === 3)
    a = [
      ...a,
      {
        id: "mega",
        name: "終極覺醒",
        desc: "大招的作用範圍大幅擴張，法師的烈焰印記也同步擴大。",
        icon: "✺",
        apply: (e) => (e.mods.mega = true),
      },
    ];
  return a.filter((u) => !world.chosen.some((c) => c.id === u.id));
}
function showUpgrade() {
  session.state = "upgrade";
  resetInput();
  let pool = upgradePool();
  let picks = [];
  if ((world.evoIndex === 1 || world.evoIndex === 3) && pool.some((u) => u.id === "mega"))
    picks.push(
      pool.splice(
        pool.findIndex((u) => u.id === "mega"),
        1,
      )[0],
    );
  else {
    let spec = pool.filter((u) =>
      heroUpgrades[player().hero].some((h) => h.id === u.id),
    );
    if (spec.length) {
      let p = spec[Math.floor(Math.random() * spec.length)];
      picks.push(p);
      pool = pool.filter((x) => x !== p);
    }
  }
  while (picks.length < 3 && pool.length)
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal"><span class="eyebrow">EVOLUTION ${String(world.evoIndex + 1).padStart(2, "0")} / 05 · 戰場已暫停</span><h2>${world.evoIndex === 1 || world.evoIndex === 3 ? "迎接你的關鍵進化" : "選擇你的進化"}</h2><p>這場戰鬥，由你定義。選擇一項能力，保留至本局結束。</p><div class="choices">${picks.map((u, i) => `<button class="choice" data-choice="${i}"><small>${heroUpgrades[player().hero].some((h) => h.id === u.id) ? "英雄專屬" : u.id === "mega" ? "終極進化" : "共通祝福"}　${u.icon}</small><b>${u.name}</b><p>${u.desc}</p></button>`).join("")}</div><div class="modal-actions"><button id="reroll" ${world.rerolls <= 0 ? "disabled" : ""}>↻ 重抽選項 · 剩餘 ${world.rerolls} 次</button></div></section>`;
  document.querySelectorAll<HTMLElement>("[data-choice]").forEach(
    (b) =>
      (b.onclick = () => {
        let u = picks[Number(b.dataset.choice)];
        u.apply(player());
        world.chosen.push(u);
        world.evoIndex++;
        $("evolutions").innerHTML = world.chosen
          .map((u) => `<span title="${u.desc}">${u.icon} ${u.name}</span>`)
          .join("");
        resume();
        announce(`已獲得進化：${u.name}`);
        tone(900, 0.2);
      }),
  );
  $("reroll").onclick = () => {
    if (world.rerolls > 0) {
      world.rerolls--;
      showUpgrade();
    }
  };
}
/**
 * 玩家主動施放技能。
 *
 * 核心層的 cast 不認識 UI 狀態機，所以「現在能不能操作」的判斷留在這裡 ——
 * 技能按鈕在暫停或商店畫面仍然點得到。
 */
function startScreen() {
  session.state = "select";
  session.selected = session.selected ?? 0;
  setupBattle(session.selected);
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<div class="start-layout"><section class="intro"><span class="eyebrow">一場戰鬥，無限種可能</span><h1>裂境</h1><div class="english">RIFTBOUND</div><p>集結你的隊伍，穿越森林戰線。<br>在隨機進化中找到專屬流派，<br>護送攻城巨獸，擊碎敵方核心。</p><div class="match-meta"><div><b>3 vs 3</b>你與 AI 隊友</div><div><b>8–12 min</b>一場冒險</div><div><b>5 次</b>隨機進化</div></div></section><section class="hero-select"><div class="select-title"><h2>選擇你的英雄</h2><span>四位英雄 · 自由選擇</span></div><div class="hero-grid">${HEROES.map((h, i) => `<button class="hero-card ${session.selected === i ? "selected" : ""}" data-hero="${i}"><span class="icon">${h.icon}</span><b>${h.name}</b><small>${h.role}</small><span class="check">${session.selected === i ? "✓" : ""}</span></button>`).join("")}</div><div id="heroDetail" class="hero-detail">${HEROES[session.selected].desc}</div><button id="start" class="primary">進入戰場　→</button><p class="start-help">${coarse ? "左側搖桿移動 · 點擊技能與普攻 · 自動瞄準附近敵人" : "右鍵 / WASD 移動 · 左鍵普攻 · 面向滑鼠"}</p></section></div>`;
  document.querySelectorAll<HTMLElement>("[data-hero]").forEach(
    (b) =>
      (b.onclick = () => {
        session.selected = Number(b.dataset.hero);
        document.querySelectorAll<HTMLElement>("[data-hero]").forEach((c) => {
          c.classList.toggle("selected", c === b);
          const check = c.querySelector(".check");
          if (check) check.textContent = c === b ? "✓" : "";
        });
        $("heroDetail").textContent = HEROES[session.selected].desc;
      }),
  );
  $("start").onclick = () => startGame(session.selected);
}
function startGame(h: number) {
  if (!Number.isInteger(h) || h < 0 || h > 3)
    throw new Error("請選擇 0 到 3 的英雄");
  if (session.state !== "select" && session.state !== "ended")
    throw new Error("請先結束目前戰局");
  setupBattle(h);
  session.state = "playing";
  $("overlay").classList.add("hidden");
  resetInput();
  resumeAudio();
  announce("戰鬥開始！右鍵或 WASD 移動，左鍵普通攻擊。");
  return { hero: HEROES[h].name, state: session.state };
}
function resume() {
  world.movePath = [];
  session.state = "playing";
  $("overlay").classList.add("hidden");
  resetInput();
}
function pauseGame() {
  if (session.state === "paused") {
    resume();
    return;
  }
  if (session.state !== "playing") return;
  session.state = "paused";
  resetInput();
  world.movePath = [];
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal pause-box"><span class="eyebrow">TAKE A BREATH</span><h2>戰場已暫停</h2><div class="instructions">右鍵點地　移動至指定位置<br>WASD　手動移動，取消點地路徑<br>角色持續面向滑鼠方向<br>左鍵　普攻（按住可連續攻擊）<br>Q / E　技能　 R　大招<br>空白鍵　閃避　 G　呼叫隊友<br>B　基地裝備　 Esc　暫停<br><br>先推倒任一路防禦塔，再攻擊核心。<br>每 60 / 150 / 240 / 330 / 420 秒進化。<br>靠近己方核心可快速恢復生命。</div><button id="resume" class="primary">繼續戰鬥</button><button id="quit" class="secondary">離開本局，重新選角</button></section>`;
  $("resume").onclick = resume;
  $("quit").onclick = startScreen;
}
function showShop() {
  if (session.state !== "playing") return;
  if (player().hp <= 0 || dist(player(), bases[0]) > 10) {
    announce("請返回己方核心附近購買裝備。");
    return;
  }
  session.state = "shop";
  resetInput();
  const cost = 180 + world.shopBuys * 100;
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal"><span class="eyebrow">基地補給 · 戰場已暫停</span><h2>準備下一波進攻</h2><p>金幣 ◈ ${Math.floor(world.gold)}　·　每次購買後，下一件裝備價格提高。</p><div class="choices">${[
      { name: "鋒銳徽章", desc: "所有傷害增加 12%。", icon: "⚔" },
      { name: "守護護符", desc: "最大生命增加 220，恢復生命。", icon: "♡" },
      { name: "疾行長靴", desc: "移動速度增加 8%。", icon: "»" },
    ]
      .map(
        (u, i) =>
          `<button class="choice" data-buy="${i}" ${world.gold < cost ? "disabled" : ""}><small>${u.icon}　◈ ${cost}</small><b>${u.name}</b><p>${u.desc}</p></button>`,
      )
      .join(
        "",
      )}</div><div class="modal-actions"><button id="closeShop">返回戰場</button></div></section>`;
  document.querySelectorAll<HTMLElement>("[data-buy]").forEach(
    (b) =>
      (b.onclick = () => {
        if (world.gold < cost) return;
        world.gold -= cost;
        world.shopBuys++;
        if (Number(b.dataset.buy) === 0)
          player().mods.power = (player().mods.power || 0) + 0.12;
        if (Number(b.dataset.buy) === 1) {
          player().maxHp += 220;
          player().hp = Math.min(player().maxHp, player().hp + 400);
        }
        if (Number(b.dataset.buy) === 2) player().speed *= 1.08;
        resume();
        announce("裝備已生效！");
        updateHud();
      }),
  );
  $("closeShop").onclick = resume;
}
function endGame(win: boolean) {
  if (session.state === "ended") return;
  session.state = "ended";
  resetInput();
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal pause-box"><span class="eyebrow">${win ? "VICTORY" : "DEFEAT"} · ${clock(world.time)}</span><h2>${win ? "勝利，核心已擊碎！" : "這次，先讓對手一局。"}</h2><p>擊敗 ${world.kills} 位英雄 · 陣亡 ${world.deaths} 次<br>獲得 ${world.chosen.length} 項進化，下局試試另一種組合。</p><div class="instructions">${world.chosen.length ? world.chosen.map((u) => u.icon + " " + u.name).join("<br>") : "新的流派，等你探索。"}</div><button id="again" class="primary">再來一局 · 重新選角</button></section>`;
  $("again").onclick = startScreen;
}
function routeChoice() {
  session.state = "route";
  resetInput();
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    '<section class="modal pause-box"><span class="eyebrow">巨獸已收服 · 戰場已暫停</span><h2>讓熔岩龜往哪裡進攻？</h2><p>跟在牠附近，衝撞防禦塔的傷害會大幅提升。</p><button class="primary" id="route0">上路進攻 ↖</button><button class="secondary" id="route1">下路進攻 ↗</button></section>';
  $("route0").onclick = () => {
    claimBoss(0, 0);
    resume();
  };
  $("route1").onclick = () => {
    claimBoss(0, 1);
    resume();
  };
}

  return {
    startScreen,
    startGame,
    resume,
    pauseGame,
    showShop,
    showUpgrade,
    routeChoice,
    endGame,
  };
}
