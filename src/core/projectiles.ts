/**
 * 投射物的飛行與命中結算。
 *
 * 原本寫在 main.js 的 update() 裡，只能靠實際遊玩驗證。搬進核心層後，
 * 「這一幀有沒有打到」可以在 Node 裡直接斷言 —— 包括 dt === 0 這種
 * 原本會讓命中判定靜默失效的邊界。
 *
 * 移除已耗盡的投射物（以及釋放它的模型）仍由呈現層負責，
 * 這裡只把 `left` 設成非正數做標記。
 */

import { damage } from "./combat.js";
import { clamp, dist } from "./vec.js";
import type { Entity, Projectile, World } from "./world.js";

/** 彈射時搜尋下一個目標的半徑。 */
const BOUNCE_RANGE = 7;
/** 彈射後重新給的飛行距離。 */
const BOUNCE_RANGE_LEFT = 8;

/** 目標本身的碰撞半徑，加上投射物半徑才是命中距離。 */
function bodyRadius(target: Entity): number {
  if (target.type === "boss") return 2.5;
  if (target.type === "tower" || target.type === "core") return 1.5;
  return 0.6;
}

/**
 * 目標到這一幀飛行線段的最近距離。
 *
 * 線段長度為零（dt === 0，或速度為零）時退化成點對點距離。原本的寫法
 * 直接除以 step，得到 NaN，而 `NaN < r` 永遠為假 —— 投射物就這樣穿過
 * 貼臉的敵人。
 */
function distanceToSweep(
  target: Entity,
  ox: number,
  oz: number,
  p: Projectile,
  step: number,
): number {
  const { dx, dz } = p;
  const a = step > 0 ? clamp(((target.x - ox) * dx + (target.z - oz) * dz) / step, 0, 1) : 0;
  return Math.hypot(target.x - (ox + (p.x - ox) * a), target.z - (oz + (p.z - oz) * a));
}

/** 彈射的下一個目標：命中點附近、尚未被這枚投射物打過的最近敵人。 */
function nextBounceTarget(world: World, p: Projectile, from: Entity): Entity | undefined {
  const { source } = p;
  const { hit } = p;
  let best: Entity | undefined;
  let bestDistance = BOUNCE_RANGE;
  for (const e of world.entities) {
    if (e.hp <= 0 || e.team === source.team || hit.has(e.id) || e === source) continue;
    const d = dist(e, from);
    if (d < bestDistance) {
      best = e;
      bestDistance = d;
    }
  }
  return best;
}

/** 推進所有投射物一幀並結算命中。 */
export function stepProjectiles(world: World, dt: number): void {
  for (const p of world.projectiles) stepProjectile(world, p, dt);
}

function stepProjectile(world: World, p: Projectile, dt: number): void {
  const { source } = p;
  const { hit } = p;
  const step = p.speed * dt;
  const ox = p.x;
  const oz = p.z;
  p.x += p.dx * step;
  p.z += p.dz * step;
  p.left = p.left - step;

  for (const t of world.entities) {
    if (t.hp <= 0 || t.team === source.team || hit.has(t.id) || t === source) continue;
    if (distanceToSweep(t, ox, oz, p, step) >= bodyRadius(t) + p.radius) continue;

    damage(world, t, p.damage, source, p.skill);
    if (p.slow) t.slow = p.slow;
    hit.add(t.id);
    world.events.emit({
      type: "burst",
      x: t.x,
      z: t.z,
      color: source.team === 0 ? 0xa8e6d9 : 0xf7b493,
      count: 3,
    });

    if (p.bounce) {
      const next = nextBounceTarget(world, p, t);
      if (next) {
        // 與命中點重合的目標沒有方向可言；沿用原本的飛行方向，
        // 下一幀的零長度判定會直接打到它。
        const d = dist(t, next);
        p.x = t.x;
        p.z = t.z;
        if (d > 0) {
          p.dx = (next.x - t.x) / d;
          p.dz = (next.z - t.z) / d;
        }
        p.left = BOUNCE_RANGE_LEFT;
        p.bounce = false;
        return;
      }
    }
    if (!p.pierce) {
      p.left = -1;
      return;
    }
  }
}
