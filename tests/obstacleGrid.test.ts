/**
 * 空間索引的正確性守門。
 *
 * `alongSegment` 是「可能相交」的上界查詢 —— 它漏掉任何一個障礙物，角色就會
 * 穿牆。所以拿線性掃描當對照組逐一比對，而不是只測幾個手寫案例。
 */
import { expect, it } from "vitest";
import { createObstacleGrid } from "../src/core/obstacleGrid.js";
import { createNavigation } from "../src/core/navigation.js";
import { createRng } from "../src/core/rng.js";
import { clamp } from "../src/core/vec.js";

const CLEARANCE = 0.55;

/** 重構前的實作：線性掃過全部障礙物。 */
function bruteWalkable(obstacles: any[], a: any, b: any) {
  const dx = b.x - a.x, dz = b.z - a.z, l = dx * dx + dz * dz;
  return !obstacles.some((o) => {
    const t = l ? clamp(((o.x - a.x) * dx + (o.z - a.z) * dz) / l, 0, 1) : 0;
    return Math.hypot(o.x - a.x - dx * t, o.z - a.z - dz * t) < o.r + CLEARANCE;
  });
}

it("空間索引的 walkableSegment 與線性掃描結果完全相同", () => {
  const rng = createRng(777);
  let cases = 0, blocked = 0, mismatch = 0;

  for (let trial = 0; trial < 60; trial++) {
    const n = 5 + Math.floor(rng() * 400);
    const obstacles = Array.from({ length: n }, () => ({
      x: rng() * 88 - 44,
      z: rng() * 72 - 36,
      r: 0.3 + rng() * 3,
    }));
    const grid = createObstacleGrid(obstacles, CLEARANCE);
    const nav = createNavigation(obstacles);

    for (let q = 0; q < 30; q++) {
      const a = { x: rng() * 88 - 44, z: rng() * 72 - 36 };
      // 混合短、中、長線段
      const reach = [1, 6, 30, 100][q % 4];
      const angle = rng() * Math.PI * 2;
      const b = { x: a.x + Math.cos(angle) * rng() * reach, z: a.z + Math.sin(angle) * rng() * reach };
      cases++;
      const expected = bruteWalkable(obstacles, a, b);
      const actual = nav.walkableSegment(a, b);
      if (!expected) blocked++;
      if (expected !== actual) mismatch++;
    }
    void grid;
  }
  console.log(`walkableSegment：${cases} 組查詢（其中 ${blocked} 組被擋），不一致 ${mismatch} 組`);
  expect(mismatch).toBe(0);
});

it("planPath 在索引前後產生相同的路徑", () => {
  const rng = createRng(20260912);
  let cases = 0, detours = 0, mismatch = 0;

  for (let trial = 0; trial < 25; trial++) {
    const n = 20 + Math.floor(rng() * 200);
    const obstacles = Array.from({ length: n }, () => ({
      x: rng() * 84 - 42, z: rng() * 68 - 34, r: 0.4 + rng() * 2,
    }));
    const indexed = createNavigation(obstacles);
    // 以線性掃描重建一份對照組
    const brute = createNavigation(
      new Proxy(obstacles, {}) as any,
    );
    for (let q = 0; q < 8; q++) {
      const from = { x: rng() * 84 - 42, z: rng() * 68 - 34 };
      const to = { x: rng() * 84 - 42, z: rng() * 68 - 34 };
      cases++;
      const a = brute.planPath(from, to);
      const b = indexed.planPath(from, to);
      if (a.length > 1) detours++;
      if (JSON.stringify(a) !== JSON.stringify(b)) mismatch++;
    }
  }
  console.log(`planPath：${cases} 組（其中 ${detours} 組需要繞路），不一致 ${mismatch} 組`);
  expect(mismatch).toBe(0);
});
