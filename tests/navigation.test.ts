import { describe, expect, it } from "vitest";
import {
  createNavigation,
  DEFAULTS,
  type Obstacle,
} from "../src/core/navigation.js";
import { createRng } from "../src/core/rng.js";
import { dist, type Point } from "../src/core/vec.js";

/** 路徑的總長度，用來判斷繞路是否合理。 */
function pathLength(from: Point, path: Point[]): number {
  let total = 0;
  let previous = from;
  for (const node of path) {
    total += dist(previous, node);
    previous = node;
  }
  return total;
}

/** 沿著路徑取樣，確認每一段都真的沒有穿過障礙物。 */
function pathIsClear(
  from: Point,
  path: Point[],
  obstacles: readonly Obstacle[],
): boolean {
  let previous = from;
  for (const node of path) {
    const steps = Math.ceil(dist(previous, node) / 0.1) || 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = previous.x + (node.x - previous.x) * t;
      const z = previous.z + (node.z - previous.z) * t;
      for (const o of obstacles)
        if (Math.hypot(o.x - x, o.z - z) < o.r) return false;
    }
    previous = node;
  }
  return true;
}

describe("walkableSegment", () => {
  const nav = createNavigation([{ x: 0, z: 0, r: 2 }]);

  it("空曠處的直線可以通行", () => {
    expect(nav.walkableSegment({ x: -10, z: 10 }, { x: 10, z: 10 })).toBe(true);
  });

  it("穿過障礙物的直線不可通行", () => {
    expect(nav.walkableSegment({ x: -10, z: 0 }, { x: 10, z: 0 })).toBe(false);
  });

  it("擦過障礙物邊緣時，會把 clearance 算進去", () => {
    const justOutside = 2 + DEFAULTS.clearance + 0.01;
    const justInside = 2 + DEFAULTS.clearance - 0.01;
    expect(
      nav.walkableSegment({ x: -10, z: justOutside }, { x: 10, z: justOutside }),
    ).toBe(true);
    expect(
      nav.walkableSegment({ x: -10, z: justInside }, { x: 10, z: justInside }),
    ).toBe(false);
  });

  it("線段是有限長度，不是無限延伸的直線", () => {
    // 障礙物在原點，這條線段整段都待在它的右側，不該被判定為擋住。
    expect(nav.walkableSegment({ x: 10, z: -5 }, { x: 10, z: 5 })).toBe(true);
  });

  it("退化成一個點時，等同於判斷該點站不站得住", () => {
    expect(nav.walkableSegment({ x: 0, z: 0 }, { x: 0, z: 0 })).toBe(false);
    expect(nav.walkableSegment({ x: 20, z: 20 }, { x: 20, z: 20 })).toBe(true);
  });
});

describe("planPath", () => {
  it("沒有障礙物時，直接回傳終點這一個節點", () => {
    const nav = createNavigation([]);
    const path = nav.planPath({ x: -20, z: -20 }, { x: 20, z: 20 });
    expect(path).toEqual([{ x: 20, z: 20 }]);
  });

  it("繞過單一障礙物，且不穿過它", () => {
    const obstacles: Obstacle[] = [{ x: 0, z: 0, r: 3 }];
    const nav = createNavigation(obstacles);
    const from = { x: -12, z: 0 };
    const to = { x: 12, z: 0 };
    const path = nav.planPath(from, to);

    expect(path.length).toBeGreaterThan(1);
    expect(path[path.length - 1]).toEqual(to);
    expect(pathIsClear(from, path, obstacles)).toBe(true);
  });

  it("繞路的長度合理，不會大幅偏離直線距離", () => {
    const obstacles: Obstacle[] = [{ x: 0, z: 0, r: 3 }];
    const nav = createNavigation(obstacles);
    const from = { x: -12, z: 0 };
    const to = { x: 12, z: 0 };
    const straight = dist(from, to);
    expect(pathLength(from, nav.planPath(from, to))).toBeLessThan(
      straight * 1.4,
    );
  });

  it("穿越一道有缺口的牆，會走缺口", () => {
    const obstacles: Obstacle[] = [];
    for (let z = -30; z <= 30; z += 1.2)
      if (Math.abs(z - 12) > 3) obstacles.push({ x: 0, z, r: 1 });
    const nav = createNavigation(obstacles);
    const from = { x: -15, z: -10 };
    const to = { x: 15, z: -10 };
    const path = nav.planPath(from, to);

    expect(path.length).toBeGreaterThan(0);
    expect(pathIsClear(from, path, obstacles)).toBe(true);
    // 必須從 z ≈ 12 的缺口穿過去。
    expect(Math.max(...path.map((p) => p.z))).toBeGreaterThan(6);
  });

  it("終點被完全包圍時回傳空陣列", () => {
    const obstacles: Obstacle[] = [];
    for (let a = 0; a < Math.PI * 2; a += 0.15)
      obstacles.push({ x: Math.cos(a) * 6, z: Math.sin(a) * 6, r: 1.2 });
    const nav = createNavigation(obstacles);
    expect(nav.planPath({ x: -20, z: 0 }, { x: 0, z: 0 })).toEqual([]);
  });

  it("平滑過的路徑，節點數遠少於逐格路徑", () => {
    const obstacles: Obstacle[] = [{ x: 0, z: 0, r: 4 }];
    const nav = createNavigation(obstacles);
    const from = { x: -30, z: 0 };
    const to = { x: 30, z: 0 };
    const path = nav.planPath(from, to);
    // 逐格路徑在 1.5 單位的格距下至少會有 40 個節點。
    expect(path.length).toBeLessThan(8);
    expect(pathIsClear(from, path, obstacles)).toBe(true);
  });

  it("起點卡在障礙物內時，仍規劃得出一條路", () => {
    const obstacles: Obstacle[] = [{ x: 0, z: 0, r: 3 }];
    const nav = createNavigation(obstacles);
    const path = nav.planPath({ x: 0.5, z: 0.5 }, { x: 20, z: 20 });

    // 平滑會失敗（從障礙物內部看不見任何節點），但退回逐格路徑仍然可走。
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual({ x: 20, z: 20 });
  });

  it("終點被困住時仍回傳空陣列，不會假裝走得到", () => {
    const obstacles: Obstacle[] = [];
    for (let a = 0; a < Math.PI * 2; a += 0.15)
      obstacles.push({ x: Math.cos(a) * 6, z: Math.sin(a) * 6, r: 1.2 });
    const nav = createNavigation(obstacles);
    expect(nav.planPath({ x: -20, z: 0 }, { x: 0, z: 0 })).toEqual([]);
  });

  it("在真實規模的地形上，規劃成本遠低於一幀的預算", () => {
    // 這是效能回歸的守門。改用空間索引之前，這樣的跨圖規劃每次約 30 ms，
    // 三十次要九百多毫秒；現在每次約 3 ms。門檻取 250 ms，對現況有三倍
    // 餘裕，但舊實作絕不可能通過。
    const rng = createRng(4242);
    const obstacles: Obstacle[] = [];
    for (let i = 0; i < 360; i++)
      obstacles.push({ x: rng() * 88 - 44, z: rng() * 72 - 36, r: 0.65 });
    const nav = createNavigation(obstacles);

    const queries = Array.from({ length: 30 }, () => ({
      from: { x: rng() * 86 - 43, z: rng() * 70 - 35 },
      to: { x: rng() * 86 - 43, z: rng() * 70 - 35 },
    }));
    nav.planPath(queries[0].from, queries[0].to);

    const started = performance.now();
    for (const q of queries) nav.planPath(q.from, q.to);
    expect(performance.now() - started).toBeLessThan(250);
  });
});
