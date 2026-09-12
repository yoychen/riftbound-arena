/**
 * 組裝層。
 *
 * 這裡把各層接在一起並跑主迴圈：核心層的模擬、render 的場景、ui 的畫面、
 * input 的事件。每一層都不認識彼此，交會點只有這個檔案。
 *
 * 仍留在這裡的 `update()` 是賽局規則（波次、巨獸、進化時點、核心衰減），
 * 之後可以再抽成 core/match.ts。
 */
import * as THREE from "three";
import {
  $,
  box,
  camera,
  cyl,
  labelCtx as ctx,
  mapCtx as mapctx,
  mesh,
  renderer,
  scene,
  screen,
  sphere,
  W,
  H,
} from "./render/renderer.js";
import {
  bases,
  curves,
  lanePoints,
  obstacles,
  river,
  teamColors,
} from "./render/terrain.js";
import { session } from "./ui/session.js";
import { bindInput, input, refreshAim } from "./input/index.js";
import { buildSkills, updateHud } from "./ui/hud.js";
import { createScreens } from "./ui/screens.js";
import {
  disposeModel,
  modelOf,
  unitModel,
  worldEntities,
  zoneMesh,
} from "./render/models.js";
import { clearEffects, playBurst, playRing, stepEffects } from "./render/effects.js";
import {
  clearFloaters,
  drawLabels,
  showDamageNumber,
  stepFloaters,
} from "./render/labels.js";
import { drawMap } from "./render/minimap.js";
import { clearFeed, showAnnounce, showFeed, tickToast } from "./ui/feed.js";
import { playTone, resumeAudio, toggleMute } from "./ui/audio.js";
import { HEROES } from "./data/heroes.js";
import { commonUpgrades, heroUpgrades } from "./data/evolutions.js";
import { clamp, clock, dist, rand } from "./core/vec.js";
import { createNavigation } from "./core/navigation.js";
import type { GameEvent, Waveform } from "./core/events.js";
import type { Point } from "./core/vec.js";
import type { Entity } from "./core/world.js";
import { createWorld } from "./core/world.js";
import { createUnit } from "./core/entities.js";
import { enemies, targetFor } from "./core/targeting.js";
import { addZone, damage, kill, shoot } from "./core/combat.js";
import { dash, move } from "./core/movement.js";
import { aimDirection, attack, cast } from "./core/skills.js";
import { ai } from "./core/ai.js";
import { TEAM_COLORS } from "./config/colors.js";

/** 這一局的模擬狀態。特效、鏡頭、音訊與 UI 狀態機不在裡面。 */
const world = createWorld();
let   viewTarget = new THREE.Vector3(),
  last = performance.now();
// 瞄準點是 THREE 的 Vector3，只讀 x / z，直接交給模擬層共用同一個物件。
world.aim = input.aim;
const coarse = input.coarse;
/**
 * 副作用發射器。ringFx / burst / announce / feed / tone 只負責描述「要發生什麼」，
 * 真正的 THREE 與 DOM 操作集中在 handleEvent，每幀 drain 一次。
 * 佇列本身掛在 world 上，核心層的戰鬥邏輯也往同一條管線送。
 */
const events = world.events;
const ringFx = (x: number, z: number, r: number, color: number, life = 0.45) =>
  events.emit({ type: "ring", x, z, r, color, life });
const burst = (x: number, z: number, color: number, count = 10) =>
  events.emit({ type: "burst", x, z, color, count });
const damageNumber = (x: number, z: number, text: number, color: string) =>
  events.emit({ type: "damage", x, z, text, color });
const announce = (text: string) => events.emit({ type: "announce", text });
const feed = (text: string) => events.emit({ type: "feed", text });
const tone = (
  freq = 400,
  duration = 0.06,
  volume = 0.025,
  wave: Waveform = "sine",
) =>
  events.emit({ type: "sound", freq, duration, volume, wave });

function handleEvent(event: GameEvent) {
  switch (event.type) {
    case "ring":
      return playRing(event.x, event.z, event.r, event.color, event.life);
    case "burst":
      return playBurst(event.x, event.z, event.color, event.count);
    case "damage":
      return showDamageNumber(event.x, event.z, event.text, event.color);
    case "playerDeath":
      input.mouseDown = false;
      return;
    case "matchEnd":
      return endGame(event.win);
    case "announce":
      return showAnnounce(event.text);
    case "feed":
      return showFeed(event.text);
    case "sound":
      return playTone(event.freq, event.duration, event.volume, event.wave);
  }
}

function addUnit(
  type: Entity["type"],
  team: number,
  x: number,
  z: number,
  hero = 0,
  lane = 0,
) {
  const e = createUnit(world, type, team, x, z, hero, lane);
  e.model = unitModel(type, team, hero);
  modelOf(e).position.set(x, 0, z);
  worldEntities.add(modelOf(e));
  return e;
}
/**
 * 清空戰場，並釋放這一局配置的 GPU 資源。
 *
 * 只從場景移除而不釋放，重開幾十局之後就會累積可觀的幾何資料 ——
 * 實測每局約 0.5 MB，而且只會漲不會跌。
 */
function clearBattle() {
  for (const e of [...world.entities, ...world.projectiles])
    if (e.model) {
      scene.remove(modelOf(e));
      worldEntities.remove(modelOf(e));
      disposeModel(e.model);
    }
  for (const z of world.zones)
    if (z.model) {
      scene.remove(modelOf(z));
      // 區域圓盤的材質是自己 new 的，不是共用快取。
      disposeModel(z.model, true);
    }
  world.entities = [];
  world.projectiles = [];
  world.zones = [];
  clearEffects();
  clearFloaters();
}
function setupBattle(hero: number) {
  world.movePath = [];
  events.clear();
  clearBattle();
  world.time = 0;
  world.waveAt = 1;
  world.bossAt = 180;
  world.boss = null;
  world.capture = null;
  world.scores = [0, 0];
  world.gold = 250;
  world.kills = 0;
  world.deaths = 0;
  world.evoIndex = 0;
  world.rerolls = 2;
  world.chosen = [];
  world.shopBuys = 0;
  world.ping = null;
  for (let t = 0; t < 2; t++) {
    addUnit("core", t, bases[t].x, bases[t].z);
    for (let l = 0; l < 2; l++) {
      let p = curves[l].getPoint(t === 0 ? 0.29 : 0.71);
      addUnit("tower", t, p.x, p.z, 0, l);
    }
  }
  world.player = addUnit("hero", 0, -31, 23, hero, 0);
  world.player.isPlayer = true;
  for (let i = 0; i < 2; i++)
    addUnit("hero", 0, -33 + i * 3, 20, (hero + i + 1) % 4, i);
  for (let i = 0; i < 3; i++)
    addUnit("hero", 1, 30 + i * 2, -22, (hero + i + 1) % 4, i % 2);
  viewTarget.set(world.player.x, 0, world.player.z);
  $("evolutions").innerHTML = "";
  clearFeed();
  buildSkills(world, playerCast);
  updateHud(world);
}
/**
 * 障礙物在地形建好之後就不再變動，所以導航實例在這裡一次建立，
 * 格點通行表由它自己在第一次規劃時算好並快取。
 */
const navigation = createNavigation(obstacles);
const planPath = navigation.planPath;

/**
 * 地形提供給模擬層的介面。
 *
 * 兵線取值仍然直接問 THREE 的曲線，而不是在核心層拿取樣點內插 ——
 * 後者會和原本的走法產生微小差異。
 */
const field = {
  obstacles,
  navigation,
  bases,
  bounds: { x: 44, z: 36 },
  pointOnLane: (lane: number, t: number) => curves[lane].getPoint(t),
  progressOn: (lane: number, point: Point) => {
    let best = Infinity,
      progress = 0;
    lanePoints[lane].forEach((p, i) => {
      const d = dist(point, p);
      if (d < best) {
        best = d;
        progress = i / 160;
      }
    });
    return progress;
  },
};

function setMoveDestination(x: number, z: number) {
  const player = world.player;
  if (session.state !== "playing" || !player || player.hp <= 0) return;
  const destination = { x: clamp(x, -43.5, 43.5), z: clamp(z, -35.5, 35.5) };
  world.movePath = planPath(player, destination);
  const end = world.movePath.at(-1);
  if (end) ringFx(end.x, end.z, 0.85, 0xf2dfa1, 0.65);
  else announce("這個位置無法抵達，請點選附近空地。");
}

/** 清空輸入狀態，避免覆蓋層關閉後角色還在移動或連打。 */
const resetInput = () => input.reset();
const screens = createScreens({
  world,
  bases,
  setupBattle,
  buildSkills: () => buildSkills(world, playerCast),
  updateHud: () => updateHud(world),
  claimBoss,
  resetInput,
  coarse,
});
const {
  startScreen,
  startGame,
  resume,
  pauseGame,
  showShop,
  showUpgrade,
  routeChoice,
  endGame,
} = screens;

function playerCast(slot: number) {
  if (session.state !== "playing" || !world.player) return;
  cast(world, field, world.player, slot);
}
function command(x = input.aim.x, z = input.aim.z) {
  if (session.state !== "playing") return;
  world.ping = { x: clamp(x, -43, 43), z: clamp(z, -35, 35), until: world.time + 13 };
  ringFx(world.ping.x, world.ping.z, 4, 0xf0d795, 1.5);
  announce("已呼叫隊友集合，指令持續 13 秒。");
  tone(800, 0.1);
}
function spawnWave() {
  for (let team = 0; team < 2; team++)
    for (let lane = 0; lane < 2; lane++)
      for (let i = 0; i < 3; i++) {
        const p = curves[lane].getPoint(team === 0 ? i * 0.008 : 1 - i * 0.008);
        const u = addUnit(
          "minion",
          team,
          p.x + rand(-0.5, 0.5),
          p.z + rand(-0.5, 0.5),
          0,
          lane,
        );
        u.progress = team === 0 ? i * 0.008 : 1 - i * 0.008;
      }
}
function nearestProgress(e: Entity) {
  return field.progressOn(e.lane, e);
}
function claimBoss(team: number, lane: number) {
  if (!world.boss) return;
  world.boss.hp = world.boss.maxHp = 2700;
  world.boss.team = team;
  world.boss.lane = lane;
  world.boss.facing = team === 0 ? 1 : -2;
  world.boss.progress = nearestProgress(world.boss);
  world.capture = null;
  ringFx(0, 0, 8, teamColors[team], 2);
  announce(`${team === 0 ? "我方" : "敵方"}收服熔岩龜！護送牠可強化攻城衝撞。`);
  feed(
    `${team === 0 ? "我方" : "敵方"}的熔岩龜前往${lane === 0 ? "上" : "下"}路`,
  );
}
function update(dt: number) {
  if (session.state !== "playing") return;
  world.time += dt;
  world.gold += dt * 1.6;
  if (world.time >= world.waveAt) {
    spawnWave();
    world.waveAt = world.time + 19;
  }
  if (!world.boss && !world.capture && world.time >= world.bossAt) {
    world.boss = addUnit("boss", -1, 0, 0);
    announce("熔岩龜甦醒！前往中央爭奪攻城巨獸。");
    tone(160, 0.4);
  }
  if (world.capture) {
    let blue = world.entities.some(
        (e) =>
          e.type === "hero" &&
          e.hp > 0 &&
          e.team === 0 &&
          dist(e, { x: 0, z: 0 }) < 8,
      ),
      red = world.entities.some(
        (e) =>
          e.type === "hero" &&
          e.hp > 0 &&
          e.team === 1 &&
          dist(e, { x: 0, z: 0 }) < 8,
      );
    if (blue && !red) {
      if (world.capture.team !== 0) {
        world.capture.team = 0;
        world.capture.value = 0;
      }
      world.capture.value += dt;
    } else if (red && !blue) {
      if (world.capture.team !== 1) {
        world.capture.team = 1;
        world.capture.value = 0;
      }
      world.capture.value += dt;
    }
    if (world.capture.value >= 5) {
      if (world.capture.team === 0) routeChoice();
      else
        claimBoss(
          1,
          world.entities
            .filter((e) => e.type === "tower" && e.team === 0 && e.hp > 0)
            .sort((a, b) => a.hp - b.hp)[0]?.lane ?? 0,
        );
    }
  }
  if (world.evoIndex < 5 && world.time >= [60, 150, 240, 330, 420][world.evoIndex]) {
    showUpgrade();
    return;
  }
  if (world.time > 600) {
    world.entities
      .filter((e) => e.type === "core" && e.hp > 0)
      .forEach((e) => {
        if (session.state === "playing")
          damage(world, e, dt * (15 + (world.time - 600) * 0.25), null);
      });
    $("phase").textContent = "核心衰減";
  }
  for (const e of world.entities) {
    if (e.hp <= 0) {
      if (e.type === "hero") {
        e.dead -= dt;
        if (e.dead <= 0) {
          e.hp = e.maxHp;
          e.x = bases[e.team].x + (e.team === 0 ? 3 : -3);
          e.z = bases[e.team].z;
          e.shield = 0;
          e.cd = [0, 0, 0, 0];
          e.invuln = 2;
          if (e.isPlayer) announce("重返戰場！");
        }
      }
      continue;
    }
    e.attack -= dt;
    e.cd = e.cd.map((c) => Math.max(0, c - dt));
    e.guard = Math.max(0, e.guard - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.boost = Math.max(0, e.boost - dt);
    e.invuln = Math.max(0, (e.invuln || 0) - dt);
    e.hit = Math.max(0, (e.hit || 0) - dt);
    e.swing = Math.max(0, (e.swing || 0) - dt);
    if (e.type === "hero") {
      if (e.xp >= e.level * 100 && e.level < 12) {
        e.xp -= e.level * 100;
        e.level++;
        e.maxHp += 70;
        e.hp = Math.min(e.maxHp, e.hp + 150);
        e.damage += 5;
        if (e.isPlayer) {
          announce(`升至 LV. ${e.level}！生命與攻擊提升。`);
          ringFx(e.x, e.z, 3, 0xe2d58e);
        }
      }
      if (dist(e, bases[e.team]) < 8)
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.18 * dt);
      else e.hp = Math.min(e.maxHp, e.hp + 1.8 * dt);
      if (!e.isPlayer) e.xp += dt * 1.4;
    }
    if (e.isPlayer) {
      if (e.stun <= 0) {
        const speed = e.speed * (e.slow > 0 ? 0.5 : 1),
          manualX =
            (input.keys.has("d") ? 1 : 0) - (input.keys.has("a") ? 1 : 0) + input.touchVector.x,
          manualZ =
            (input.keys.has("s") ? 1 : 0) - (input.keys.has("w") ? 1 : 0) + input.touchVector.z,
          manualLength = Math.hypot(manualX, manualZ),
          manualActive =
            ["w", "a", "s", "d"].some((k) => input.keys.has(k)) ||
            Math.hypot(input.touchVector.x, input.touchVector.z) > 0;
        e.moving = false;
        if (manualActive) {
          world.movePath = [];
          if (manualLength > 0)
            move(field, 
              e,
              (manualX / Math.max(1, manualLength)) * speed,
              (manualZ / Math.max(1, manualLength)) * speed,
              dt,
            );
        } else if (world.movePath.length) {
          const dest = world.movePath[0],
            dx = dest.x - e.x,
            dz = dest.z - e.z,
            d = Math.hypot(dx, dz);
          if (d < 0.18) world.movePath.shift();
          else {
            const step = Math.min(speed, d / dt);
            move(field, e, (dx / d) * step, (dz / d) * step, dt);
            if (dist(e, dest) < 0.18) world.movePath.shift();
          }
        }
        const dir = aimDirection(world, e);
        if (Math.hypot(dir.x, dir.z) > 0.03)
          e.facing = Math.atan2(dir.x, dir.z);
        if (input.mouseDown) attack(world, e);
      }
    } else ai(world, field, e, dt);
  }
  for (const p of world.projectiles) {
    let step = p.speed * dt;
    let ox = p.x,
      oz = p.z;
    p.x += p.dx * step;
    p.z += p.dz * step;
    p.left -= step;
    for (const t of world.entities) {
      if (
        t.hp <= 0 ||
        t.team === p.source.team ||
        p.hit.has(t.id) ||
        t === p.source
      )
        continue;
      let a = clamp(((t.x - ox) * p.dx + (t.z - oz) * p.dz) / step, 0, 1),
        dd = Math.hypot(
          t.x - (ox + (p.x - ox) * a),
          t.z - (oz + (p.z - oz) * a),
        );
      if (
        dd <
        (t.type === "boss"
          ? 2.5
          : t.type === "tower" || t.type === "core"
            ? 1.5
            : 0.6) +
          p.radius
      ) {
        damage(world, t, p.damage, p.source, p.skill);
        if (p.slow) t.slow = p.slow;
        p.hit.add(t.id);
        burst(t.x, t.z, p.source.team === 0 ? 0xa8e6d9 : 0xf7b493, 3);
        if (p.bounce) {
          const next = world.entities
            .filter(
              (e) =>
                e.hp > 0 &&
                e.team !== p.source.team &&
                !p.hit.has(e.id) &&
                e !== p.source &&
                dist(e, t) < 7,
            )
            .sort((a, b) => dist(a, t) - dist(b, t))[0];
          if (next) {
            let d = dist(t, next);
            p.x = t.x;
            p.z = t.z;
            p.dx = (next.x - t.x) / d;
            p.dz = (next.z - t.z) / d;
            p.left = 8;
            p.bounce = false;
            break;
          }
        }
        if (!p.pierce) {
          p.left = -1;
          break;
        }
      }
    }
  }
  world.projectiles = world.projectiles.filter((p) => {
    if (p.left <= 0) {
      if (p.model) {
        scene.remove(modelOf(p));
        disposeModel(p.model);
      }
      return false;
    }
    return true;
  });
  for (const z of world.zones) {
    z.life -= dt;
    z.tick -= dt;
    if (z.tick <= 0) {
      z.tick = 0.65;
      ringFx(z.x, z.z, z.r, z.source.team === 0 ? 0xb4dfdb : 0xf9a47e, 0.35);
      for (const e of world.entities)
        if (e.hp > 0 && e.team !== z.source.team && dist(e, z) < z.r) {
          damage(world, e, z.dmg, z.source, true);
          e.slow = Math.max(e.slow, z.slow);
          e.stun = Math.max(e.stun, z.stun);
        }
    }
  }
  world.zones = world.zones.filter((z) => {
    if (z.life <= 0) {
      if (z.model) {
        scene.remove(modelOf(z));
        // 區域圓盤的材質是自己 new 的，不是共用快取。
        disposeModel(z.model, true);
      }
      return false;
    }
    return true;
  });
  for (const e of world.entities) {
    if (e.hp > 0 && e.mods.thorns) {
      if (e.hadShield && e.shield <= 0) {
        for (const t of enemies(world, e, 5)) damage(world, t, 160, e, true);
        ringFx(e.x, e.z, 5, 0xe9bb83);
      }
      e.hadShield = e.shield > 0;
    }
  }
  world.entities = world.entities.filter((e) => {
    if (e.hp <= 0 && e.type === "minion") {
      worldEntities.remove(modelOf(e));
      disposeModel(e.model);
      return false;
    }
    return true;
  });
  syncModels(dt);
  if (session.state !== "playing") return;
  updateHud(world);
}
/**
 * 模擬 → 場景的單向同步。
 *
 * 模擬層只寫純數值（x / z / facing / hp / hit），模型的位置、旋轉與可見性
 * 一律在這裡推導。這道單向性是把遊戲邏輯與 THREE 分開的前提：邏輯不再需要
 * 持有 Object3D，也就能在沒有 WebGL 的環境裡執行與測試。
 */
/** 區域圓盤是單一網格，不是群組。 */
const zoneDisc = (z: { model?: unknown }) => z.model as THREE.Mesh;

function syncModels(dt: number) {
  // 模擬只描述投射物與區域的位置與外觀參數，模型在這裡按需建立。
  for (const p of world.projectiles) {
    if (!p.model)
      p.model = sphere(p.big ? 0.34 : 0.18, p.color, p.x, 1.15, p.z, scene);
    modelOf(p).position.set(p.x, 1.1, p.z);
  }
  for (const z of world.zones) {
    if (!z.model) z.model = zoneMesh(z.x, z.z, z.r, z.color);
    (zoneDisc(z).material as THREE.Material).opacity =
      z.tick > 0 ? 0.12 : 0.35;
  }
  for (const e of world.entities) {
    modelOf(e).visible = e.hp > 0;
    if (e.hp <= 0) continue;
    const bob =
      (e.type === "hero" || e.type === "minion") && e.moving
        ? Math.abs(Math.sin(world.time * 14 + e.id)) * 0.13
        : 0;
    modelOf(e).position.set(e.x, bob, e.z);
    modelOf(e).rotation.y = e.facing;
    modelOf(e).scale.setScalar(e.hit > 0 ? 1.045 : 1);
    const crystal = modelOf(e).userData.crystal as THREE.Object3D | undefined;
    if (crystal) {
      crystal.rotation.y = world.time * 0.6;
      crystal.position.y +=
        (Math.sin(world.time * 2) - Math.sin((world.time - dt) * 2)) * 0.12;
    }
  }
}
const aimRing = new THREE.Mesh(
  new THREE.RingGeometry(0.4, 0.49, 24),
  new THREE.MeshBasicMaterial({
    color: 0xf2dfa1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  }),
);
aimRing.rotation.x = -Math.PI / 2;
scene.add(aimRing);
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.045);
  last = now;
  // 觸控裝置、或滑鼠還沒動過時沒有有意義的游標位置，改為自動鎖定。
  world.autoAim = input.coarse || !input.pointerKnown;
  if (session.state === "playing") {
    refreshAim();
    update(dt);
  }
  // 輸入處理與 UI 也會發事件，所以不論處於哪個狀態都要取用。
  events.drain(handleEvent);
  if (session.state === "select") {
    viewTarget.lerp(new THREE.Vector3(0, 0, 0), 0.04);
    camera.position.lerp(new THREE.Vector3(4, 68, 57), 0.035);
    camera.lookAt(viewTarget);
  } else if (world.player) {
    viewTarget.lerp(
      new THREE.Vector3(world.player.x, 0, world.player.z),
      1 - Math.exp(-dt * 7),
    );
    camera.position.set(viewTarget.x, 35, viewTarget.z + 29);
    camera.lookAt(viewTarget.x, 0, viewTarget.z - 3);
  }
  aimRing.visible =
    session.state === "playing" &&
    input.pointerKnown &&
    !input.coarse &&
    (world.player?.hp ?? 0) > 0;
  aimRing.position.set(input.aim.x, 0.17, input.aim.z);
  renderer.render(scene, camera);
  drawLabels(world, session.state);
  drawMap(world, session.state);
}
bindInput({
  world,
  resumeAudio,
  toggleSound: () => {
    $("sound").textContent = toggleMute() ? "♫ 靜音" : "♫ 音效";
  },
  playerCast,
  attack,
  setMoveDestination,
  command,
  showShop,
  pauseGame,
  resume,
});

startScreen();
requestAnimationFrame(frame);
/**
 * 頁面可以向宿主註冊工具（例如在支援的瀏覽器裡讓助理讀取戰況）。
 * 這是實驗性 API，型別還不在 lib.dom 裡。
 */
interface ModelContextHost {
  registerTool?: (tool: unknown, options?: { signal?: AbortSignal }) => unknown;
}
const modelContext = (document as Document & { modelContext?: ModelContextHost })
  .modelContext;

if (modelContext?.registerTool) {
  const life = new AbortController();
  const tools = [
    {
      name: "read_match_state",
      title: "查看裂境戰局",
      description:
        "Read the current match state, hero, score, evolution and boss status.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        state: session.state,
        seconds: Math.floor(world.time),
        hero: world.player ? HEROES[world.player.hero].name : null,
        health: world.player ? Math.ceil(world.player.hp) : null,
        score: world.scores,
        evolutions: world.chosen.map((u) => u.name),
        boss: world.boss ? { team: world.boss.team, health: world.boss.hp } : null,
      }),
    },
    {
      name: "start_match",
      title: "開始裂境戰鬥",
      description:
        "Start a new match from the hero selection screen. Hero 0 swordsman, 1 archer, 2 mage, 3 fighter.",
      inputSchema: {
        type: "object",
        properties: { hero: { type: "integer", minimum: 0, maximum: 3 } },
        required: ["hero"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input?: { hero?: number }) => startGame(input?.hero ?? 0),
    },
  ];
  for (const tool of tools)
    try {
      Promise.resolve(
        modelContext.registerTool!(tool, { signal: life.signal }),
      ).catch(() => {});
    } catch {}
  window.addEventListener("pagehide", () => life.abort(), { once: true });
}
