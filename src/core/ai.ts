/**
 * 非玩家單位的行為。
 *
 * 原本是一個兩百行的 `ai()`，用一連串 `else if` 把四種兵種的決策疊在一起。
 * 現在依兵種拆開，每個函式回傳「這一幀想去哪裡」，最後由共通的段落負責
 * 真正的位移 —— 決策與執行分離，讀起來才知道某個兵種到底在想什麼。
 */

import { HEROES } from "../data/heroes.js";
import type { Battlefield } from "./battlefield.js";
import { addZone, damage, shoot } from "./combat.js";
import { move } from "./movement.js";
import { attack, cast } from "./skills.js";
import { countEnemies, targetFor } from "./targeting.js";
import { clamp, dist, type Point } from "./vec.js";
import type { Entity, World } from "./world.js";

/** 英雄的索敵距離比射程遠，才會主動往戰場走。 */
const HERO_VISION = 18;
/** 巨獸巢穴在地圖中央。 */
const PIT: Point = { x: 0, z: 0 };
/** 緩速讓移動速度砍半。 */
const SLOW_FACTOR = 0.5;

/** 各兵種每次決策往兵線前方推進多少進度。 */
const LANE_STEP = { hero: 0.04, minion: 0.022, boss: 0.035 };

/** 回家補血的血量門檻：低於這個就撤，在家裡則補到這個才出門。 */
const RETREAT_AT = 0.24;
const LEAVE_BASE_AT = 0.8;

/** 沿兵線往敵方基地推進後的目標點。 */
function advanceAlongLane(
  field: Battlefield,
  entity: Entity,
  step: number,
): Point {
  entity.progress = field.progressOn(entity.lane, entity);
  return field.pointOnLane(
    entity.lane,
    clamp(
      (entity.progress) + (entity.team === 0 ? step : -step),
      0,
      1,
    ),
  );
}

/** 防禦塔與核心不會移動，射程內有目標就開火。 */
function defendStructure(world: World, entity: Entity, target?: Entity): void {
  if (!target || dist(entity, target) > (entity.range)) return;
  if ((entity.attack) > 0) return;

  entity.attack = entity.type === "tower" ? 1.15 : 1.5;
  shoot(
    world,
    entity,
    { x: target.x - entity.x, z: target.z - entity.z },
    {
      range: (entity.range) + 2,
      damage: entity.damage,
      speed: 24,
      big: true,
    },
  );
}

/** 中立巨獸守在巢穴，靠近才反擊。 */
function guardPit(world: World, entity: Entity, target?: Entity): Point | null {
  if (!target || dist(entity, PIT) >= 7) return PIT;

  if (dist(entity, target) < 5 && (entity.attack) <= 0) {
    entity.attack = 2.5;
    addZone(world, entity.x, entity.z, 5, 0.9, entity, 160, 0xf79c65, 0.65);
  }
  return target;
}

/** 英雄要去哪裡。優先序由上到下，第一個成立的就決定了。 */
function heroDestination(
  world: World,
  field: Battlefield,
  entity: Entity,
  target: Entity | undefined,
): { dest: Point | null; target: Entity | undefined } {
  const base = field.bases[entity.team];
  const boss = world.boss;

  // 殘血就撤退，並且在家補到八成才重新出門。
  if (entity.hp < entity.maxHp * RETREAT_AT) return { dest: base, target: undefined };
  if (dist(entity, base) < 8 && entity.hp < entity.maxHp * LEAVE_BASE_AT)
    return { dest: base, target: undefined };

  // 玩家按 G 的集合指令，只有我方 AI 隊友會聽。
  if (entity.team === 0 && world.ping && world.ping.until > world.time) {
    const inCombat = target && dist(entity, target) < (entity.range);
    return { dest: inCombat ? null : world.ping, target };
  }

  // 自己這隊正在收服巨獸，回巢穴站點。
  if (world.capture && world.capture.team === entity.team)
    return { dest: PIT, target };

  if (boss && boss.hp > 0 && boss.team === -1) {
    // time % 180 讓 AI 在爭奪週期剛開始的五秒內先不要一窩蜂往中路衝，
    // 除非已經站在附近。
    const contesting = world.time % 180 > 5 || dist(entity, boss) < 17;
    if (contesting)
      return {
        dest: boss,
        target: dist(entity, boss) < (entity.range) + 1 ? boss : target,
      };
  }
  // 護送自家的攻城巨獸。
  if (boss && boss.hp > 0 && boss.team === entity.team && dist(entity, boss) < 27)
    return { dest: boss, target };

  if (target && dist(entity, target) < 14) return { dest: target, target };
  return { dest: advanceAlongLane(field, entity, LANE_STEP.hero), target };
}

/** 進入射程後的攻擊、技能與走位。 */
function fightAsHero(
  world: World,
  field: Battlefield,
  entity: Entity,
  target: Entity,
): Point | null {
  const d = { x: target.x - entity.x, z: target.z - entity.z };
  entity.facing = Math.atan2(d.x, d.z);

  if ((entity.attack) <= 0) {
    if ((entity.range) > 6) {
      // 遠程 AI 直接發射，不走 attack()：它的扇形判定只適用近戰。
      entity.attack = HEROES[entity.hero].rate;
      shoot(world, entity, d);
    } else attack(world, entity);
  }

  // 對硬目標或被圍住時才交技能，免得把冷卻浪費在補兵上。
  const worthSkills =
    target.type === "hero" ||
    target.type === "boss" ||
    countEnemies(world, entity, 8) > 2;
  if (worthSkills) {
    const cd = entity.cd;
    if (cd[0] <= 0) cast(world, field, entity, 0);
    // 法師的烈焰印記是主力輸出，其他英雄的 E 多半是保命技。
    if (cd[1] <= 0 && (entity.hero === 2 || entity.hp < entity.maxHp * LEAVE_BASE_AT))
      cast(world, field, entity, 1);
    if (cd[2] <= 0 && world.time > 22) cast(world, field, entity, 2);
  }

  const range = entity.range;
  const distance = dist(entity, target);
  // 遠程被貼臉就後退，距離舒適時原地繞圈，近戰則站著打。
  if (range > 6 && distance < 5) return { x: entity.x - d.x, z: entity.z - d.z };
  if (range > 6 && distance < range * 0.85)
    return {
      x: entity.x + Math.sin(world.time + (entity.id)) * 2,
      z: entity.z + Math.cos(world.time * 0.7 + (entity.id)) * 2,
    };
  return null;
}

/** 小兵只會推線，路上遇到誰就打誰。 */
function minionDestination(
  world: World,
  field: Battlefield,
  entity: Entity,
  target: Entity | undefined,
): Point | null {
  if (!target) return advanceAlongLane(field, entity, LANE_STEP.minion);
  if (dist(entity, target) > (entity.range)) return target;

  entity.facing = Math.atan2(target.x - entity.x, target.z - entity.z);
  attack(world, entity);
  return null;
}

/** 已收服的攻城巨獸沿指定路推進，撞擊建築。 */
function siegeDestination(
  world: World,
  field: Battlefield,
  entity: Entity,
): Point | null {
  const target = world.entities
    .filter(
      (u) =>
        u.hp > 0 &&
        u.team === 1 - entity.team &&
        ((u.type === "tower" && u.lane === entity.lane) || u.type === "core"),
    )
    .sort((a, b) => dist(entity, a) - dist(entity, b))[0];
  if (!target) return null;

  if (dist(entity, target) >= 6) {
    const ahead = advanceAlongLane(field, entity, LANE_STEP.boss);
    // 被推離兵線太遠就先歸位，否則會卡在地形上原地打轉。
    const onLane = field.pointOnLane(entity.lane, entity.progress);
    return dist(entity, onLane) > 5 ? onLane : ahead;
  }

  if ((entity.attack) <= 0) {
    entity.attack = 2.4;
    // 有英雄護送時撞擊威力大幅提升 —— 這是護送巨獸的意義所在。
    const escorted = world.entities.some(
      (u) =>
        u.type === "hero" &&
        u.hp > 0 &&
        u.team === entity.team &&
        dist(entity, u) < 10,
    );
    damage(world, target, escorted ? 440 : 160, entity, true);
    world.events.emit({ type: "ring", x: entity.x, z: entity.z, r: 6, color: 0xffc78a, life: 0.45 });
    world.events.emit({ type: "sound", freq: 100, duration: 0.2, volume: 0.025, wave: "sine" });
  }
  return null;
}

export function ai(
  world: World,
  field: Battlefield,
  entity: Entity,
  dt: number,
): void {
  if ((entity.stun) > 0) return;

  let target = targetFor(
    world,
    entity,
    entity.type === "hero" ? HERO_VISION : (entity.range) + 0.8,
  );
  const speed = (entity.speed) * ((entity.slow) > 0 ? SLOW_FACTOR : 1);
  let dest: Point | null = null;

  if (entity.type === "tower" || entity.type === "core") {
    defendStructure(world, entity, target);
    return;
  }

  if (entity.type === "boss" && entity.team < 0) {
    dest = guardPit(world, entity, target);
  } else if (entity.type === "hero") {
    const chosen = heroDestination(world, field, entity, target);
    dest = chosen.dest;
    target = chosen.target;
    if (target && dist(entity, target) <= (entity.range) + 1)
      dest = fightAsHero(world, field, entity, target);
  } else if (entity.type === "minion") {
    dest = minionDestination(world, field, entity, target);
  } else if (entity.type === "boss") {
    dest = siegeDestination(world, field, entity);
  }

  if (!dest) {
    entity.moving = false;
    return;
  }

  const dx = dest.x - entity.x;
  const dz = dest.z - entity.z;
  const distance = Math.hypot(dx, dz);
  if (distance > 1) {
    // 只有英雄會被樹擋住，其他單位穿過去，免得兵線卡在地形上。
    move(field, entity, (dx / distance) * speed, (dz / distance) * speed, dt, entity.type !== "hero");
    entity.facing = Math.atan2(dx, dz);
  } else entity.moving = false;
}
