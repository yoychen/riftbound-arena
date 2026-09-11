import { describe, expect, it } from "vitest";
import {
  createNavigation,
  DEFAULTS,
  type Obstacle,
} from "../src/core/navigation.js";
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

  // 既知缺陷，見 docs/refactor-plan.md #10：起點卡在障礙物內部時規劃會失敗，
  // 因為路徑平滑要求「從起點看得見第一個節點」，而在障礙物內部誰都看不見。
  // 這裡記錄現況，階段 7 修正後要把斷言改成能規劃出路徑。
  it("起點卡在障礙物內時，目前會規劃失敗", () => {
    const obstacles: Obstacle[] = [{ x: 0, z: 0, r: 3 }];
    const nav = createNavigation(obstacles);
    expect(nav.planPath({ x: 0.5, z: 0.5 }, { x: 20, z: 20 })).toEqual([]);
    // 對照組：只要站在障礙物外，同樣的終點就規劃得出來。
    expect(
      nav.planPath({ x: -4, z: -4 }, { x: 20, z: 20 }).length,
    ).toBeGreaterThan(0);
  });

  it("重複規劃時，格點通行表只算一次", () => {
    let reads = 0;
    const obstacles = new Proxy([{ x: 0, z: 0, r: 3 }] as Obstacle[], {
      get(target, prop, receiver) {
        if (prop === "some") reads++;
        return Reflect.get(target, prop, receiver);
      },
    });
    const nav = createNavigation(obstacles);
    nav.planPath({ x: -12, z: 0 }, { x: 12, z: 0 });
    const afterFirst = reads;
    nav.planPath({ x: -12, z: 4 }, { x: 12, z: -4 });
    // 第二次規劃不該再為了建表而全圖掃描一次。
    expect(reads - afterFirst).toBeLessThan(afterFirst);
  });
});
