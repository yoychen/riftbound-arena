/** 選敵與目標優先權。 */

import { dist } from "./vec.js";
import type { Entity, World } from "./world.js";

/**
 * 範圍內的敵對單位。
 *
 * 中立巨獸（team -1）只有英雄會主動攻擊 —— 小兵與防禦塔不該被中立怪
 * 拉走注意力，否則兵線會在中路卡死。
 */
export function enemies(
  world: World,
  entity: Entity,
  range: number,
): Entity[] {
  return world.entities.filter(
    (other) =>
      other !== entity &&
      other.hp > 0 &&
      other.team !== entity.team &&
      (other.team >= 0 || entity.type === "hero") &&
      dist(entity, other) < range,
  );
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
  const candidates = enemies(world, entity, range);
  let best: Entity | undefined;
  let bestRank = Infinity;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const rank =
      entity.type === "tower"
        ? towerPriority(candidate, entity.aggro)
        : PRIORITY[candidate.type];
    const d = dist(entity, candidate);
    if (rank < bestRank || (rank === bestRank && d < bestDistance)) {
      best = candidate;
      bestRank = rank;
      bestDistance = d;
    }
  }
  return best;
}
