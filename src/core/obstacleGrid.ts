/**
 * 障礙物的空間索引。
 *
 * 地圖上有數百顆樹，而「這條線有沒有撞到東西」是路徑規劃與移動每幀都要問
 * 好幾次的問題。原本的實作對每次查詢都線性掃過全部障礙物，A* 展開一個節點
 * 就要掃八次 —— 單次長距離規劃因此要花 30 毫秒，遠超過一幀的預算。
 *
 * 把障礙物依格子分桶之後，查詢只需要看線段實際經過的那幾格。
 * 障礙物在一局之內不會變動，所以索引在建構時算一次就好。
 */

import type { Obstacle } from "./navigation.js";
import type { Point } from "./vec.js";

export interface ObstacleGrid {
  /** 可能與線段 a→b 相交的障礙物。回傳的是上界，呼叫端仍需精確判定。 */
  alongSegment(a: Point, b: Point): readonly Obstacle[];
  /** 可能與以 (x, z) 為中心、半徑 radius 的圓相交的障礙物。 */
  near(x: number, z: number, radius: number): readonly Obstacle[];
}

/** 格子邊長。太小則格數暴增，太大則每格裝太多障礙物失去意義。 */
const CELL = 4;

export function createObstacleGrid(
  obstacles: readonly Obstacle[],
  /** 查詢時額外放寬的距離，要涵蓋呼叫端用的間隙。 */
  margin = 1,
): ObstacleGrid {
  if (!obstacles.length) {
    const empty: readonly Obstacle[] = [];
    return { alongSegment: () => empty, near: () => empty };
  }

  const maxRadius = Math.max(...obstacles.map((o) => o.r));
  /** 障礙物中心可能落在查詢點外多遠仍然相交。 */
  const reach = maxRadius + margin;

  const cells = new Map<number, Obstacle[]>();
  const key = (cx: number, cz: number) => cx * 100000 + cz;
  const cellOf = (v: number) => Math.floor(v / CELL);

  for (const o of obstacles) {
    const cell = key(cellOf(o.x), cellOf(o.z));
    const bucket = cells.get(cell);
    if (bucket) bucket.push(o);
    else cells.set(cell, [o]);
  }

  /** 收集一個矩形範圍內所有格子的障礙物。 */
  function collect(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    out: Set<Obstacle>,
  ): void {
    const x0 = cellOf(minX - reach);
    const x1 = cellOf(maxX + reach);
    const z0 = cellOf(minZ - reach);
    const z1 = cellOf(maxZ + reach);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = cells.get(key(cx, cz));
        if (bucket) for (const o of bucket) out.add(o);
      }
  }

  return {
    alongSegment(a, b) {
      const found = new Set<Obstacle>();
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      // 短線段直接用包圍盒；長線段沿途取樣，避免對角線的包圍盒涵蓋過多空格。
      const steps = Math.max(1, Math.ceil(length / CELL));
      for (let i = 0; i < steps; i++) {
        const t0 = i / steps;
        const t1 = (i + 1) / steps;
        const ax = a.x + (b.x - a.x) * t0;
        const az = a.z + (b.z - a.z) * t0;
        const bx = a.x + (b.x - a.x) * t1;
        const bz = a.z + (b.z - a.z) * t1;
        collect(
          Math.min(ax, bx),
          Math.min(az, bz),
          Math.max(ax, bx),
          Math.max(az, bz),
          found,
        );
      }
      return [...found];
    },

    near(x, z, radius) {
      const found = new Set<Obstacle>();
      collect(x - radius, z - radius, x + radius, z + radius, found);
      return [...found];
    },
  };
}
