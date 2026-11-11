/** 選敵與目標優先權。 */

import { dist } from "./vec.js";
import type { Entity, World } from "./world.js";

/**
 * 這個單位是不是可以攻擊的敵人。
 *
 * 中立巨獸（team -1）只有英雄會主動攻擊 —— 小兵與防禦塔不該被中立怪
 * 拉走注意力，否則兵線會在中路卡死。
 */
function isEnemy(entity: Entity, other: Entity): boolean {
  return (
    other !== entity &&
    other.hp > 0 &&
    other.team !== entity.team &&
    (other.team >= 0 || entity.type === "hero")
  );
}

/**
 * 走訪範圍內的敵人，不配置中間陣列。
 *
 * 選敵在 AI 裡是每個單位每幀都要做的事。用 filter 的話，一場中後期的戰鬥
 * 每秒會產生上百個短命陣列 —— 平均成本其實微不足道，但累積的垃圾會讓
 * GC 偶爾停頓，表現為零星的掉幀。
 */
export function forEachEnemy(
  world: World,
  entity: Entity,
  range: number,
  visit: (enemy: Entity, distance: number) => void,
): void {
  for (const other of world.entities) {
    if (!isEnemy(entity, other)) continue;
    const d = dist(entity, other);
    if (d < range) visit(other, d);
  }
}

/** 範圍內的敵人數量。判斷「有沒有被圍住」用，不需要清單。 */
export function countEnemies(
  world: World,
  entity: Entity,
  range: number,
): number {
  let count = 0;
  forEachEnemy(world, entity, range, () => count++);
  return count;
}

/** 範圍內的敵對單位。需要逐一處理的技能與近戰判定才用這個。 */
export function enemies(
  world: World,
  entity: Entity,
  range: number,
): Entity[] {
  const found: Entity[] = [];
  forEachEnemy(world, entity, range, (enemy) => found.push(enemy));
  return found;
}

/** 目標優先權：英雄 > 小兵 > 建築 > 巨獸，同級取近的。 */
const PRIORITY: Record<Entity["type"], number> = {
  hero: 0,
  minion: 1,
  tower: 2,
  core: 2,
  boss: 3,
};

/**
 * 防禦塔的優先權另有一套：先打仇恨目標（剛攻擊過我方英雄的人），
 * 其次才是小兵，免得塔被小兵綁住讓英雄站在塔下輸出。
 */
function towerPriority(target: Entity, aggro: unknown): number {
  if (target.id === aggro) return -5;
  if (target.type === "minion") return -2;
  return PRIORITY[target.type];
}

/** 範圍內最該打的一個，沒有就回傳 undefined。 */
export function targetFor(
  world: World,
  entity: Entity,
  range: number = entity.range as number,
): Entity | undefined {
  let best: Entity | undefined;
  let bestRank = Infinity;
  let bestDistance = Infinity;

  forEachEnemy(world, entity, range, (candidate, d) => {
    const rank =
      entity.type === "tower"
        ? towerPriority(candidate, entity.aggro)
        : PRIORITY[candidate.type];
    if (rank < bestRank || (rank === bestRank && d < bestDistance)) {
      best = candidate;
      bestRank = rank;
      bestDistance = d;
    }
  });
  return best;
}
