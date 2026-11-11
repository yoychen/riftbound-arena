/**
 * 障礙物迴避與路徑規劃。
 *
 * 障礙物由呼叫端注入而非在此生成，因為它們的座標是地形建構的副產物
 * （每棵樹在放進場景時順便登記一個碰撞圓）。這樣核心層就不需要知道
 * THREE 的存在，測試也能餵進自己的幾何佈局。
 */

import { createObstacleGrid } from "./obstacleGrid.js";
import { clamp, dist, type Point } from "./vec.js";

export interface Obstacle extends Point {
  /** 碰撞半徑。 */
  r: number;
}

export interface NavigationOptions {
  /** 格點間距。 */
  step?: number;
  cols?: number;
  rows?: number;
  /** 格點 0 的世界座標。 */
  originX?: number;
  originZ?: number;
  /** 路徑與障礙物之間要保留的額外間隙。 */
  clearance?: number;
}

export interface Navigation {
  /** a 到 b 的直線是否不被任何障礙物擋住。 */
  walkableSegment(a: Point, b: Point): boolean;
  /** 可能與該圓相交的障礙物。移動時的推擠用，避免每次都掃全圖。 */
  obstaclesNear(x: number, z: number, radius: number): readonly Obstacle[];
  /**
   * 規劃 from 到 to 的路徑，回傳要依序經過的轉折點。
   * 無法抵達時回傳空陣列。
   */
  planPath(from: Point, to: Point): Point[];
}

/**
 * 連通區域小於這個格數就視為封死的口袋。開闊地帶有數千格，
 * 被障礙物圍起來的坑通常只有個位數。
 */
const ENCLOSED_LIMIT = 40;

export const DEFAULTS: Required<NavigationOptions> = {
  step: 1.5,
  cols: 59,
  rows: 49,
  originX: -43.5,
  originZ: -36,
  clearance: 0.55,
};

export function createNavigation(
  obstacles: readonly Obstacle[],
  options: NavigationOptions = {},
): Navigation {
  const { step, cols, rows, originX, originZ, clearance } = {
    ...DEFAULTS,
    ...options,
  };
  const nodeCount = cols * rows;
  const grid = createObstacleGrid(obstacles, clearance);

  const id = (x: number, z: number) => z * cols + x;
  const point = (n: number): Point => ({
    x: originX + (n % cols) * step,
    z: originZ + Math.floor(n / cols) * step,
  });

  function walkableSegment(a: Point, b: Point): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lengthSquared = dx * dx + dz * dz;
    // 只檢查線段經過的格子裡的障礙物，而不是全圖。
    return !grid.alongSegment(a, b).some((o) => {
      const t = lengthSquared
        ? clamp(((o.x - a.x) * dx + (o.z - a.z) * dz) / lengthSquared, 0, 1)
        : 0;
      return (
        Math.hypot(o.x - a.x - dx * t, o.z - a.z - dz * t) < o.r + clearance
      );
    });
  }

  /**
   * 每個格點是否站得住人。障礙物在一局之內不會改變，所以整張表在第一次
   * 用到時算一次就好 —— 原本的實作把這份 memo 放在 planPath 內部，於是
   * 每次點擊都要重算兩千多個格點乘上數百個障礙物。
   */
  let passable: Uint8Array | null = null;
  function table(): Uint8Array {
    if (!passable) {
      passable = new Uint8Array(nodeCount);
      for (let n = 0; n < nodeCount; n++) {
        const p = point(n);
        passable[n] = grid
          .near(p.x, p.z, 0)
          .some((o) => Math.hypot(o.x - p.x, o.z - p.z) < o.r + clearance)
          ? 0
          : 1;
      }
    }
    return passable;
  }

  const valid = (n: number) => table()[n] === 1;

  /** 離 p 最近、且站得住人的格點；全圖都站不住時回傳 -1。 */
  function accessible(p: Point): number {
    let best = -1;
    let bestDistance = Infinity;
    for (let n = 0; n < nodeCount; n++) {
      if (!valid(n)) continue;
      const d = dist(p, point(n));
      if (d < bestDistance) {
        bestDistance = d;
        best = n;
      }
    }
    return best;
  }

  /**
   * 從某個格點往外走，最多數到 limit 個連通格點。
   *
   * 用來區分兩種 A* 失敗：終點真的被圍死（區域很小），
   * 或只是起點卡在連不出去的縫隙裡（終點其實通向整張地圖）。
   */
  function regionSize(from: number, limit: number): number {
    const seen = new Set([from]);
    const queue = [from];
    while (queue.length && seen.size < limit) {
      const current = queue.shift()!;
      const x = current % cols;
      const z = Math.floor(current / cols);
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          if (x + dx < 0 || x + dx >= cols || z + dz < 0 || z + dz >= rows)
            continue;
          const next = id(x + dx, z + dz);
          if (seen.has(next)) continue;
          if (!valid(next) || !walkableSegment(point(current), point(next)))
            continue;
          seen.add(next);
          queue.push(next);
        }
    }
    return seen.size;
  }

  function search(start: number, goal: number): number[] | null {
    const open = new Set([start]);
    const cameFrom = new Map<number, number>();
    const cost = new Map<number, number>([[start, 0]]);
    const score = (n: number) =>
      (cost.get(n) ?? Infinity) + dist(point(n), point(goal));

    while (open.size) {
      let current = -1;
      let best = Infinity;
      for (const n of open) {
        const f = score(n);
        if (f < best) {
          best = f;
          current = n;
        }
      }
      if (current === goal) {
        const nodes = [goal];
        let n = goal;
        while (cameFrom.has(n)) {
          n = cameFrom.get(n)!;
          nodes.unshift(n);
        }
        return nodes;
      }
      open.delete(current);
      const x = current % cols;
      const z = Math.floor(current / cols);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          if (x + dx < 0 || x + dx >= cols || z + dz < 0 || z + dz >= rows)
            continue;
          const next = id(x + dx, z + dz);
          if (!valid(next) || !walkableSegment(point(current), point(next)))
            continue;
          const nextCost = cost.get(current)! + Math.hypot(dx, dz) * step;
          if (nextCost < (cost.get(next) ?? Infinity)) {
            cameFrom.set(next, current);
            cost.set(next, nextCost);
            open.add(next);
          }
        }
      }
    }
    return null;
  }

  /**
   * 把逐格路徑收斂成最少轉折的折線：從目前的錨點往後找最遠一個仍在視線內
   * 的節點，跳過中間所有節點，如此反覆。
   *
   * 起點若卡在障礙物內部，從那裡看不見任何節點，平滑就進行不下去。
   * 這時退回未平滑的逐格路徑，而不是宣告無路可走 —— 對玩家來說，
   * 走得醜總比右鍵完全沒反應好。
   */
  function smooth(from: Point, nodes: Point[]): Point[] {
    const result: Point[] = [];
    let anchor = from;
    let remaining = nodes;
    while (remaining.length) {
      let furthest = -1;
      for (let i = 0; i < remaining.length; i++)
        if (walkableSegment(anchor, remaining[i])) furthest = i;
      if (furthest < 0) {
        // 從錨點看不見任何節點。第一步就失敗代表起點被困住，
        // 整條逐格路徑原樣送出；中途失敗則保留已收斂的部分再接上剩下的。
        return [...result, ...remaining];
      }
      anchor = remaining[furthest];
      result.push(anchor);
      remaining = remaining.slice(furthest + 1);
    }
    return result;
  }

  function planPath(from: Point, to: Point): Point[] {
    if (walkableSegment(from, to)) return [{ ...to }];

    const nearest = (p: Point) =>
      id(
        clamp(Math.round((p.x - originX) / step), 0, cols - 1),
        clamp(Math.round((p.z - originZ) / step), 0, rows - 1),
      );

    let start = nearest(from);
    if (!valid(start) || !walkableSegment(from, point(start)))
      start = accessible(from);
    const goal = accessible(to);
    if (start < 0 || goal < 0) return [];

    const path = search(start, goal);
    if (!path) {
      /**
       * A* 連不起來有兩種可能，處置完全不同。
       *
       * 規劃用的間隙（0.55）比移動用的（0.48）大，路徑才不會貼著樹角走。
       * 代價是角色擠得進去的縫隙在格點圖上是封死的 —— 起點因此可能落在一個
       * 連不出去的口袋裡，而終點其實通向整張地圖。這時直接朝終點走，讓移動
       * 的碰撞滑移把人帶出來，正是玩家改用 WASD 會做的事。
       *
       * 但若終點自己被圍死，就該老實回報走不到。用有界的連通區域大小區分：
       * 圍死的口袋只有幾格，開闊地帶一下就數滿。
       */
      const goalIsEnclosed = regionSize(goal, ENCLOSED_LIMIT) < ENCLOSED_LIMIT;
      return goalIsEnclosed ? [] : [{ ...to }];
    }

    const nodes = path.map(point);
    if (walkableSegment(nodes[nodes.length - 1], to)) nodes.push({ ...to });
    return smooth(from, nodes);
  }

  return {
    walkableSegment,
    planPath,
    obstaclesNear: (x, z, radius) => grid.near(x, z, radius),
  };
}
