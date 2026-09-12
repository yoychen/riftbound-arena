/**
 * 普攻與英雄技能。
 *
 * 技能原本寫成 `if (e.hero === 0) { if (slot === 0) ... } }` 四段巢狀分支，
 * 一個檔案裡疊了十二個匿名的效果。現在每個技能是一個具名函式，掛在
 * `HERO_SKILLS[英雄][技能槽]` 這張表上 —— 要查「烈焰印記做什麼」不必再
 * 數分支。
 */

import { NEUTRAL_COLOR, TEAM_COLORS } from "../config/colors.js";
import { HEROES } from "../data/heroes.js";
import type { Battlefield } from "./battlefield.js";
import { addZone, damage, shoot } from "./combat.js";
import { dash, move } from "./movement.js";
import { enemies, targetFor } from "./targeting.js";
import { dist, normalize, type Point } from "./vec.js";
import type { Entity, World } from "./world.js";

/** 自動選敵與技能瞄準的最大距離。 */
const AIM_RANGE = 18;
/** 技能落點離施放者的上限。 */
const CAST_RANGE = 13;
/** 沒有明確落點時，預設打在正前方這個距離。 */
const DEFAULT_CAST_DISTANCE = 8;
/** 閃避（第四個技能槽）的位移與冷卻。 */
const DODGE = { length: 5.5, cooldown: 4.5 };

/**
 * 這一擊朝哪裡。
 *
 * 玩家一般以游標為準；觸控裝置或滑鼠還沒動過時改為自動鎖定最近的敵人，
 * 因為那時沒有有意義的游標位置。AI 一律打自己的目標，沒有目標就維持面向。
 */
export function aimDirection(world: World, entity: Entity): Point {
  if (entity.isPlayer) {
    if (world.autoAim) {
      const target = targetFor(world, entity, AIM_RANGE);
      if (target) return { x: target.x - entity.x, z: target.z - entity.z };
    }
    return { x: world.aim.x - entity.x, z: world.aim.z - entity.z };
  }
  const target = targetFor(world, entity, AIM_RANGE);
  return target
    ? { x: target.x - entity.x, z: target.z - entity.z }
    : { x: Math.sin(entity.facing), z: Math.cos(entity.facing) };
}

/** 普攻的間隔。英雄看自身攻速，boost 期間加快。 */
function attackInterval(entity: Entity): number {
  if (entity.type === "hero")
    return (
      HEROES[entity.hero as number].rate / ((entity.boost as number) > 0 ? 1.65 : 1)
    );
  return entity.type === "minion" ? 1.1 : 1.25;
}

export function attack(world: World, entity: Entity): void {
  if ((entity.attack as number) > 0 || entity.hp <= 0 || (entity.stun as number) > 0)
    return;

  const d = normalize(aimDirection(world, entity));
  entity.facing = Math.atan2(d.x, d.z);
  entity.swing = 0.18;
  entity.attack = attackInterval(entity);

  const mods = entity.mods as Record<string, unknown>;
  const range = entity.range as number;

  if (range < 6) {
    world.events.emit({
      type: "ring",
      x: entity.x + d.x * 1.4,
      z: entity.z + d.z * 1.4,
      r: range * 0.6,
      color: entity.team < 0 ? NEUTRAL_COLOR : TEAM_COLORS[entity.team],
      life: 0.18,
    });
    // 近戰是一個朝向面前的扇形，背後的敵人打不到。
    for (const target of enemies(world, entity, range + 1)) {
      const facingness =
        ((target.x - entity.x) * d.x + (target.z - entity.z) * d.z) /
        (dist(entity, target) || 1);
      if (facingness > -0.1) damage(world, target, entity.damage as number, entity);
    }
    if (mods.blade)
      shoot(world, entity, d, {
        damage: (entity.damage as number) * 0.55,
        range: 10,
        pierce: true,
        color: 0x92ead2,
      });
  } else {
    shoot(world, entity, d);
    if (mods.split)
      for (const angle of [-0.17, 0.17])
        shoot(world, entity, rotate(d, angle), {
          damage: (entity.damage as number) * 0.6,
        });
  }

  if (entity.isPlayer)
    world.events.emit({
      type: "sound",
      freq: entity.hero === 0 ? 220 : entity.hero === 1 ? 650 : 430,
      duration: 0.045,
      volume: 0.014,
      wave: "triangle",
    });
}

/** 把方向向量旋轉 angle 弧度。 */
function rotate(d: Point, angle: number): Point {
  return {
    x: d.x * Math.cos(angle) - d.z * Math.sin(angle),
    z: d.x * Math.sin(angle) + d.z * Math.cos(angle),
  };
}

interface CastContext {
  world: World;
  field: Battlefield;
  caster: Entity;
  /** 單位方向向量。 */
  d: Point;
  /** 技能落點，已限制在 CAST_RANGE 之內。 */
  target: Point;
  /** 施放者的英雄資料。 */
  hero: (typeof HEROES)[number];
  mods: Record<string, unknown>;
}

type Skill = (ctx: CastContext) => void;

// ── 逐風劍士 ────────────────────────────────────────────────────

/** 疾風斬：突進並劈開沿途的敵人。 */
const windSlash: Skill = ({ world, field, caster, d, hero }) => {
  const fromX = caster.x;
  const fromZ = caster.z;
  dash(world, field, caster, d, 6);
  // 判定沿著突進起點的軸線，所以被穿過的人也吃得到。
  for (const target of enemies(world, caster, 9)) {
    const ux = target.x - fromX;
    const uz = target.z - fromZ;
    const along = ux * d.x + uz * d.z;
    const across = Math.abs(ux * d.z - uz * d.x);
    if (along > -1 && along < 9 && across < 3)
      damage(world, target, 155, caster, true);
  }
  world.events.emit({ type: "ring", x: caster.x, z: caster.z, r: 3.2, color: hero.color, life: 0.45 });
};

/** 鏡心格擋：短暫大幅減傷並獲得護盾。 */
const mirrorGuard: Skill = ({ world, caster }) => {
  caster.guard = 1.8;
  caster.shield = (caster.shield as number) + 90;
  world.events.emit({ type: "ring", x: caster.x, z: caster.z, r: 2.3, color: 0xd8efc7, life: 1.8 });
};

/** 千刃風暴：以自身為中心的持續傷害，期間保有減傷。 */
const bladeStorm: Skill = ({ world, caster, hero, mods }) => {
  addZone(world, caster.x, caster.z, mods.mega ? 9 : 6, 3.2, caster, 100, hero.color, 0.1);
  caster.guard = 1.2;
};

// ── 晨星射手 ────────────────────────────────────────────────────

/** 穿星箭：貫穿一直線。 */
const piercingArrow: Skill = ({ world, caster, d, mods }) => {
  const shot = { range: 22, pierce: true, big: true, skill: true, color: 0xffd997 };
  shoot(world, caster, d, { ...shot, damage: 170 });
  if (mods.fan)
    for (const angle of [-0.22, 0.22])
      shoot(world, caster, rotate(d, angle), { ...shot, damage: 120, range: 20 });
};

/** 靈巧翻滾：向後拉開距離並短暫加快攻速。 */
const nimbleRoll: Skill = ({ world, field, caster, d, mods }) => {
  dash(world, field, caster, { x: -d.x, z: -d.z }, 6);
  caster.boost = 3;
  if (mods.roll)
    for (const offset of [-0.2, 0, 0.2])
      shoot(world, caster, { x: d.x + offset, z: d.z }, { damage: 75, range: 15 });
};

/** 流星箭雨：指定地點的持續轟炸，附帶緩速。 */
const meteorVolley: Skill = ({ world, caster, target, mods }) => {
  addZone(world, target.x, target.z, mods.mega ? 9 : 6, 4, caster, 95, 0xe9cc7d, 0.55, 0.6);
};

// ── 暮光法師 ────────────────────────────────────────────────────

/** 寒霜法球：命中後大幅緩速，為烈焰印記鋪路。 */
const frostOrb: Skill = ({ world, caster, d, mods }) => {
  shoot(world, caster, d, {
    damage: 135,
    range: 17,
    big: true,
    pierce: !!mods.fan,
    slow: 3,
    skill: true,
    color: 0x98e8ef,
  });
};

/** 烈焰印記：短延遲的高爆發，打在走不掉的目標身上。 */
const flameBrand: Skill = ({ world, caster, target, mods }) => {
  addZone(world, target.x, target.z, mods.mega ? 7 : 4.5, 1, caster, 235, 0xfa9870, 0.7);
};

/** 雷霆領域：持續落雷並緩速。 */
const thunderDomain: Skill = ({ world, caster, target, mods }) => {
  addZone(world, target.x, target.z, mods.mega ? 9 : 6, 4.5, caster, 100, 0xc1a1ff, 0.3, 0.8);
};

// ── 磐石鬥士 ────────────────────────────────────────────────────

/** 山崩衝撞：撞開一群人並暈眩。 */
const landslide: Skill = ({ world, field, caster, d, hero }) => {
  dash(world, field, caster, d, 7);
  for (const target of enemies(world, caster, 4.5)) {
    damage(world, target, 165, caster, true);
    target.stun = 1.2;
    move(field, target, d.x * 3, d.z * 3, 1, true);
  }
  world.events.emit({ type: "ring", x: caster.x, z: caster.z, r: 4.2, color: hero.color, life: 0.45 });
};

/** 震地護盾：厚護盾加上一圈短暫的緩速。 */
const quakeShield: Skill = ({ world, caster, hero, mods }) => {
  caster.shield = (caster.shield as number) + 300 + (mods.fortress ? 200 : 0);
  addZone(world, caster.x, caster.z, 4.8, 0.4, caster, 100, hero.color, 0.1, 2);
};

/** 大地崩裂：範圍暈眩與重擊，同時給自己護盾。 */
const earthshatter: Skill = ({ world, caster, mods }) => {
  addZone(world, caster.x, caster.z, mods.mega ? 10 : 7, 0.8, caster, 340, 0xf9bd84, 0.45, 0, 2);
  caster.shield = (caster.shield as number) + 250;
};

/** 四位英雄的 Q / E / R。索引對應 HEROES 與技能槽。 */
const HERO_SKILLS: Skill[][] = [
  [windSlash, mirrorGuard, bladeStorm],
  [piercingArrow, nimbleRoll, meteorVolley],
  [frostOrb, flameBrand, thunderDomain],
  [landslide, quakeShield, earthshatter],
];

/**
 * 施放技能槽 slot。0/1/2 是 Q/E/R，3 是閃避。
 *
 * 呼叫端要自行確認現在可以操作（例如不在暫停或商店畫面）。
 */
export function cast(
  world: World,
  field: Battlefield,
  caster: Entity,
  slot: number,
): void {
  const cd = caster.cd as number[];
  if (caster.hp <= 0 || cd[slot] > 0 || (caster.stun as number) > 0) return;

  const hero = HEROES[caster.hero as number];
  const d = normalize(aimDirection(world, caster));

  const requested =
    caster.isPlayer && !world.autoAim
      ? world.aim
      : {
          x: caster.x + d.x * DEFAULT_CAST_DISTANCE,
          z: caster.z + d.z * DEFAULT_CAST_DISTANCE,
        };
  const target =
    dist(caster, requested) > CAST_RANGE
      ? { x: caster.x + d.x * CAST_RANGE, z: caster.z + d.z * CAST_RANGE }
      : { x: requested.x, z: requested.z };

  caster.facing = Math.atan2(d.x, d.z);

  if (slot === 3) {
    dash(world, field, caster, d, DODGE.length);
    cd[3] = DODGE.cooldown;
    return;
  }

  const mods = caster.mods as Record<string, unknown>;
  cd[slot] = hero.cd[slot] * (mods.haste ? 0.78 : 1);
  if (caster.isPlayer)
    world.events.emit({
      type: "sound",
      freq: slot === 2 ? 130 : 510,
      duration: 0.16,
      volume: 0.04,
      wave: "triangle",
    });

  HERO_SKILLS[caster.hero as number][slot]({
    world,
    field,
    caster,
    d,
    target,
    hero,
    mods,
  });
}
