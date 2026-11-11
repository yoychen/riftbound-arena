/**
 * 單位的建立與基礎數值。
 *
 * 原本的 `addUnit` 用五層巢狀三元運算子依 type 決定 hp / damage / range /
 * speed，四個欄位各寫一遍。改成一張表之後，要調整某個兵種的數值只需要看
 * 一列，也不必擔心四串三元運算子的分支順序不一致。
 */

import { HEROES } from "../data/heroes.js";
import type { Entity, World } from "./world.js";

export type UnitType = Entity["type"];

interface BaseStats {
  hp: number;
  damage: number;
  range: number;
  speed: number;
}

interface HeroData {
  hp: number;
  damage: number;
  range: number;
  speed: number;
}

/**
 * 各兵種的基礎數值。小兵隨戰鬥時間成長，所以是函式而非常數 ——
 * 後期的兵線才推得動防禦塔。
 */
const UNIT_STATS: Record<
  UnitType,
  (hero: HeroData, time: number) => BaseStats
> = {
  hero: (hero) => ({
    hp: hero.hp,
    damage: hero.damage,
    range: hero.range,
    speed: hero.speed,
  }),
  minion: (_hero, time) => ({
    hp: 240 + time * 0.18,
    damage: 22 + time * 0.018,
    range: 2.8,
    speed: 4.2,
  }),
  tower: () => ({ hp: 3600, damage: 115, range: 11, speed: 4.2 }),
  core: () => ({ hp: 6000, damage: 90, range: 10, speed: 4.2 }),
  boss: () => ({ hp: 3800, damage: 115, range: 5, speed: 3 }),
};

/**
 * 建立一個單位並放進戰局。
 *
 * 回傳的實體不含任何模型 —— 呈現層負責在之後掛上 `model`，模擬層不看它。
 */
export function createUnit(
  world: World,
  type: UnitType,
  team: number,
  x: number,
  z: number,
  hero = 0,
  lane = 0,
): Entity {
  const stats = UNIT_STATS[type](HEROES[hero] as HeroData, world.time);
  const entity: Entity = {
    id: world.nextId++,
    type,
    team,
    x,
    z,
    hero,
    lane,
    hp: stats.hp,
    maxHp: stats.hp,
    damage: stats.damage,
    range: stats.range,
    speed: stats.speed,
    attack: 0,
    /** 面向角度（弧度）。模型旋轉由呈現層的 syncModels 推導。 */
    facing: 0,
    cd: [0, 0, 0, 0],
    dead: 0,
    /** 沿著兵線的進度，0 是藍方基地、1 是紅方基地。 */
    progress: team === 0 ? 0 : 1,
    level: 1,
    xp: 0,
    shield: 0,
    guard: 0,
    slow: 0,
    stun: 0,
    boost: 0,
    invuln: 0,
    hit: 0,
    swing: 0,
    mark: 0,
    moving: false,
    mods: {},
  };
  world.entities.push(entity);
  return entity;
}
