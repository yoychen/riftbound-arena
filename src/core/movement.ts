/** 位移與障礙物推擠。 */

import { TEAM_COLORS } from "../config/colors.js";
import type { Battlefield } from "./battlefield.js";
import { addZone } from "./combat.js";
import { clamp, type Point } from "./vec.js";
import type { Entity, World } from "./world.js";

/** 單位與障礙物中心至少要保持的距離。 */
const CLEARANCE = 0.48;
/** 被推開後擺放的距離，比 CLEARANCE 多一點，避免下一幀立刻又判定重疊。 */
const PUSH_OUT = 0.5;

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

  if (!ignoreObstacles)
    for (const o of field.obstacles) {
      // 既知缺陷（docs/refactor-plan.md #7）：推擠只做一次，從 A 推開後
      // 可能正好落進 B。密林區偶爾會卡住。
      if (Math.hypot(x - o.x, z - o.z) < o.r + CLEARANCE) {
        const angle = Math.atan2(z - o.z, x - o.x);
        x = o.x + Math.cos(angle) * (o.r + PUSH_OUT);
        z = o.z + Math.sin(angle) * (o.r + PUSH_OUT);
      }
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
