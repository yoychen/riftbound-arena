/** 位移與障礙物推擠。 */

import { TEAM_COLORS } from "../config/colors.js";
import type { Battlefield } from "./battlefield.js";
import { addZone } from "./combat.js";
import type { Obstacle } from "./navigation.js";
import { clamp, type Point } from "./vec.js";
import type { Entity, World } from "./world.js";

/** 單位與障礙物中心至少要保持的距離。 */
const CLEARANCE = 0.48;
/** 被推開後擺放的距離，比 CLEARANCE 多一點，避免下一幀立刻又判定重疊。 */
const PUSH_OUT = 0.5;
/** 便宜的推擠輪數。單一接觸點一輪就夠，夾角處多幾輪能解掉大部分。 */
const PUSH_PASSES = 4;
/** 脫困搜尋的最大半徑與解析度。 */
const ESCAPE_RADIUS = 3;
const ESCAPE_STEP = 0.25;
const ESCAPE_ANGLES = 16;

/** 這個位置有沒有踩進任何障礙物。 */
function overlaps(obstacles: readonly Obstacle[], x: number, z: number): boolean {
  return obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.r + CLEARANCE);
}

/**
 * 從重疊狀態脫困，回傳一個站得住的位置。
 *
 * 先做幾輪「推到最近那棵樹的邊緣」——單一接觸點一輪就解決，成本幾乎為零。
 * 但樹與樹會互相重疊（地形生成沒有檢查彼此的距離），在夾角處逐一硬推會
 * 來回震盪：實測十六輪之後仍有百分之一點七解不掉。
 *
 * 所以還解不掉時改用環狀搜尋，由近而遠找第一個合法落點。這條路徑只在
 * 真的卡住時才走，而卡住本來就罕見。
 */
function resolveOverlap(
  obstacles: readonly Obstacle[],
  x: number,
  z: number,
): { x: number; z: number } {
  for (let pass = 0; pass < PUSH_PASSES; pass++) {
    let pushed = false;
    for (const o of obstacles) {
      if (Math.hypot(x - o.x, z - o.z) < o.r + CLEARANCE) {
        const angle = Math.atan2(z - o.z, x - o.x);
        x = o.x + Math.cos(angle) * (o.r + PUSH_OUT);
        z = o.z + Math.sin(angle) * (o.r + PUSH_OUT);
        pushed = true;
      }
    }
    if (!pushed) return { x, z };
  }
  if (!overlaps(obstacles, x, z)) return { x, z };

  for (let radius = ESCAPE_STEP; radius <= ESCAPE_RADIUS; radius += ESCAPE_STEP)
    for (let i = 0; i < ESCAPE_ANGLES; i++) {
      const angle = (i / ESCAPE_ANGLES) * Math.PI * 2;
      const cx = x + Math.cos(angle) * radius;
      const cz = z + Math.sin(angle) * radius;
      if (!overlaps(obstacles, cx, cz)) return { x: cx, z: cz };
    }
  // 半徑三單位內都沒有落腳處，只能維持原狀。
  return { x, z };
}

/**
 * 以每秒 (dx, dz) 的速度移動 dt 秒。
 *
 * `ignoreObstacles` 給突進與位移技能用 —— 它們本來就該穿過樹叢。
 */
export function move(
  field: Battlefield,
  entity: Entity,
  dx: number,
  dz: number,
  dt: number,
  ignoreObstacles = false,
): void {
  let x = clamp(entity.x + dx * dt, -field.bounds.x, field.bounds.x);
  let z = clamp(entity.z + dz * dt, -field.bounds.z, field.bounds.z);

  if (!ignoreObstacles) {
    // 只取附近的障礙物，而不是掃全圖 —— 迭代解算才付得起。
    const nearby = field.navigation.obstaclesNear(
      x,
      z,
      ESCAPE_RADIUS + CLEARANCE + PUSH_OUT,
    );
    const resolved = resolveOverlap(nearby, x, z);
    x = clamp(resolved.x, -field.bounds.x, field.bounds.x);
    z = clamp(resolved.z, -field.bounds.z, field.bounds.z);
  }

  entity.x = x;
  entity.z = z;
  entity.moving = Math.hypot(dx, dz) > 0.1;
}

/** 往 direction 瞬間位移，期間短暫無敵。 */
export function dash(
  world: World,
  field: Battlefield,
  entity: Entity,
  direction: Point,
  length = 6,
): void {
  // 突進取消點地移動，否則角色會立刻被既有路徑拉回去。
  if (entity.isPlayer) world.movePath = [];

  const n = Math.hypot(direction.x, direction.z) || 1;
  const fromX = entity.x;
  const fromZ = entity.z;
  move(field, entity, (direction.x / n) * length, (direction.z / n) * length, 1, true);
  entity.invuln = 0.22;

  world.events.emit({
    type: "ring",
    x: fromX,
    z: fromZ,
    r: 1.8,
    color: TEAM_COLORS[entity.team] ?? 0xefb078,
    life: 0.3,
  });

  const mods = entity.mods as Record<string, unknown>;
  if (mods.trail) addZone(world, fromX, fromZ, 3.2, 3, entity, 28, 0xf6a266, 0.2);
  if (mods.roll) entity.boost = 3;
}
