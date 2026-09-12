/**
 * 傷害結算與擊殺處理。
 *
 * 這個檔案是整個重構的目的地：戰鬥規則原本和特效、音效、UI 混在一起，
 * 只能靠實際遊玩驗證。現在它不碰 THREE 也不碰 DOM，副作用一律描述成事件，
 * 因此每一條規則都可以在 Node 裡直接斷言。
 */

import { TEAM_COLORS } from "../config/colors.js";
import { HEROES } from "../data/heroes.js";
import { clamp, dist, type Point } from "./vec.js";
import type { Entity, World } from "./world.js";

/** 小兵擊殺的金幣與經驗分享半徑。 */
const SHARE_RANGE = 22;

/**
 * 核心在「還有防禦塔存活，且每一路都至少留著一座」時免疫傷害。
 * 換句話說：要打核心，得先清空任一整路的防禦塔。
 */
function coreIsShielded(world: World, core: Entity): boolean {
  const towers = world.entities.filter(
    (e) => e.type === "tower" && e.team === core.team && e.hp > 0,
  );
  if (!towers.length) return false;
  const laneIsOpen = [0, 1].some(
    (lane) => !towers.some((tower) => tower.lane === lane),
  );
  return !laneIsOpen;
}

/** 建築對一般傷害有減免，普攻比技能更吃虧；攻城巨獸不受此限。 */
function structureReduction(
  source: Entity | null | undefined,
  target: Entity,
  skill: boolean,
): number {
  if (!source || source.type === "boss") return 1;
  if (target.type !== "tower" && target.type !== "core") return 1;
  return skill ? 0.28 : 0.55;
}

export function damage(
  world: World,
  target: Entity,
  amount: number,
  source: Entity | null | undefined,
  skill = false,
): void {
  if (target.hp <= 0) return;
  // 無敵要在最前面判：閃避或復活保護期間，這一擊完全不存在 ——
  // 不減傷、不反傷、不上緩速、不觸發任何特效。
  if (target.invuln > 0) return;
  if (target.type === "core" && coreIsShielded(world, target)) return;

  let n = amount;
  if (source?.type === "boss" && target.type === "core") n *= 0.4;
  n *= structureReduction(source, target, skill);

  if ((target.guard) > 0) {
    n *= 0.18;
    if (source && target.mods.reflect) {
      source.hp = Math.max(1, source.hp - 45);
      world.events.emit({
        type: "ring",
        x: source.x,
        z: source.z,
        r: 1.5,
        color: 0x92ead2,
        life: 0.45,
      });
    }
  }
  if (source) {
    const mods = source.mods;
    n *= 1 + ((mods.power) || 0);
    if (mods.execute && target.hp < target.maxHp * 0.35) n *= 1.4;
    if (skill && mods.combo && (target.slow) > 0) n *= 1.65;
    if (mods.frost) target.slow = Math.max(target.slow, 0.7);
    if (mods.mark && target.type !== "tower" && target.type !== "core") {
      target.mark += 1;
      if (target.mark >= 4) {
        target.mark = 0;
        n += 100;
        world.events.emit({
          type: "ring",
          x: target.x,
          z: target.z,
          r: 2,
          color: 0xffb96b,
          life: 0.45,
        });
      }
    }
  }

  const absorbed = Math.min(target.shield, n);
  target.shield = (target.shield) - absorbed;
  n -= absorbed;
  target.hp -= n;
  target.hit = 0.12;

  if (source?.isPlayer || target.isPlayer)
    world.events.emit({
      type: "damage",
      x: target.x,
      z: target.z,
      text: Math.ceil(n),
      color: target.isPlayer ? "#ffae9a" : skill ? "#f5d27d" : "#f0f2df",
    });

  if (source && source.mods.leech)
    source.hp = Math.min(source.maxHp, source.hp + n * 0.12);

  // 英雄互毆時，攻擊方會被守方塔記上仇恨。
  if (target.type === "hero" && source?.type === "hero")
    for (const tower of world.entities)
      if (
        tower.type === "tower" &&
        tower.team === target.team &&
        dist(tower, source) < (tower.range)
      )
        tower.aggro = source.id;

  if (target.hp <= 0) kill(world, target, source);
}

export function kill(
  world: World,
  entity: Entity,
  source: Entity | null | undefined,
): void {
  entity.hp = 0;
  world.events.emit({
    type: "burst",
    x: entity.x,
    z: entity.z,
    color: entity.team === 0 ? 0x70d8d1 : 0xed9b75,
    count: 14,
  });

  if (entity.type === "hero") killHero(world, entity, source);
  if (entity.type === "minion") killMinion(world, entity, source);
  if (entity.type === "tower") killTower(world, entity, source);
  if (entity.type === "core")
    world.events.emit({ type: "matchEnd", win: entity.team === 1 });
  if (entity.type === "boss") killBoss(world, entity, source);
}

function killHero(
  world: World,
  entity: Entity,
  source: Entity | null | undefined,
): void {
  // 沒有明確擊殺者時（塔、區域、衰減）算在對手隊頭上。
  const credited =
    source && source.team >= 0 ? source.team : 1 - entity.team;
  world.scores[credited]++;
  // 復活時間隨戰鬥長度拉長，後期的一次陣亡代價更高。
  entity.dead = 7 + Math.min(9, world.time / 60);

  if (entity.isPlayer) {
    world.movePath = [];
    world.deaths++;
    world.events.emit({ type: "playerDeath" });
    world.events.emit({ type: "announce", text: "稍作休息，保留所有進化後復活。" });
  }
  if (source?.isPlayer) {
    world.kills++;
    world.gold += 110;
    world.events.emit({ type: "sound", freq: 760, duration: 0.14, volume: 0.025, wave: "sine" });
    world.events.emit({ type: "announce", text: "擊敗英雄！＋110 金幣" });
  }

  const killer =
    source?.type === "hero"
      ? HEROES[source.hero].name
      : source?.type === "tower"
        ? "防禦塔"
        : "戰場";
  world.events.emit({
    type: "feed",
    text: `${killer} 擊敗 ${HEROES[entity.hero].name}`,
  });
}

function killMinion(
  world: World,
  entity: Entity,
  source: Entity | null | undefined,
): void {
  const player = world.player;
  if (
    player &&
    player.hp > 0 &&
    entity.team !== player.team &&
    dist(player, entity) < SHARE_RANGE
  ) {
    // 補到刀的金幣比在旁邊分的多。
    world.gold += source?.isPlayer ? 23 : 15;
    player.xp = ((player.xp) || 0) + 25;
  }
  for (const hero of world.entities)
    if (
      hero.type === "hero" &&
      hero.team !== entity.team &&
      hero.hp > 0 &&
      !hero.isPlayer &&
      dist(hero, entity) < SHARE_RANGE
    )
      hero.xp = ((hero.xp) || 0) + 25;
}

function killTower(
  world: World,
  entity: Entity,
  source: Entity | null | undefined,
): void {
  if (source?.team === 0) world.gold += 200;
  world.events.emit({
    type: "announce",
    text:
      entity.team === 1
        ? "敵方防禦塔已摧毀！核心道路已開啟。"
        : "我方防禦塔遭到摧毀！",
  });
  world.events.emit({
    type: "feed",
    text: entity.team === 1 ? "我方摧毀一座防禦塔" : "敵方摧毀一座防禦塔",
  });
}

function killBoss(
  world: World,
  entity: Entity,
  source: Entity | null | undefined,
): void {
  if (entity.team === -1) {
    // 中立巨獸倒下只是開始，還要在巢穴待滿五秒才收得到。
    world.capture = { team: source?.team ?? 0, value: 0 };
    world.events.emit({ type: "announce", text: "巨獸倒下了！留在巢穴完成 5 秒收服。" });
  } else {
    world.boss = null;
    world.bossAt = world.time + 140;
    world.events.emit({ type: "announce", text: "攻城巨獸已倒下，下次爭奪即將到來。" });
  }
}

/** 發射投射物的可調參數。未指定的欄位取施放者的數值。 */
export interface ShotOptions {
  damage?: number;
  range?: number;
  speed?: number;
  /** 較大的彈體與碰撞半徑。 */
  big?: boolean;
  /** 穿透：命中後繼續飛行。 */
  pierce?: boolean;
  /** 命中後彈向附近的下一個敵人。預設取施放者的 bounce 進化。 */
  bounce?: boolean;
  /** 命中後施加的緩速秒數。 */
  slow?: number;
  /** 是否計為技能傷害（影響建築減免與 combo）。 */
  skill?: boolean;
  color?: number;
}

/**
 * 發射一枚投射物。
 *
 * 回傳的投射物不含模型 —— 呈現層會在同步時替沒有模型的投射物補上，
 * 就像實體那樣。
 */
export function shoot(
  world: World,
  source: Entity,
  direction: Point,
  options: ShotOptions = {},
): void {
  const length = Math.hypot(direction.x, direction.z) || 1;
  const mods = source.mods;
  world.projectiles.push({
    x: source.x,
    z: source.z,
    dx: direction.x / length,
    dz: direction.z / length,
    speed: options.speed || 28,
    left: options.range || (source.range),
    source,
    damage: options.damage || (source.damage),
    pierce: options.pierce || false,
    hit: new Set<number>(),
    big: !!options.big,
    radius: options.big ? 0.95 : 0.65,
    color: options.color ?? TEAM_COLORS[source.team] ?? 0xefb078,
    slow: options.slow,
    skill: options.skill,
    bounce: options.bounce ?? !!mods.bounce,
  });
}

/**
 * 放置一塊持續傷害的地面區域。
 *
 * `delay` 是第一次結算前的預告時間，讓對手有機會走開 ——
 * 這也是為什麼放置時會先畫一圈提示光環。
 */
export function addZone(
  world: World,
  x: number,
  z: number,
  r: number,
  life: number,
  source: Entity,
  dmg: number,
  color: number,
  delay = 0.7,
  slow = 0,
  stun = 0,
): void {
  const px = clamp(x, -44, 44);
  const pz = clamp(z, -36, 36);
  world.zones.push({
    x: px,
    z: pz,
    r,
    life,
    max: life,
    source,
    dmg,
    delay,
    tick: delay,
    color,
    slow,
    stun,
  });
  world.events.emit({
    type: "ring",
    x: px,
    z: pz,
    r,
    color,
    life: delay + 0.2,
  });
}
