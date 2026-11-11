import { describe, expect, it } from "vitest";
import { dash, move } from "../src/core/movement.js";
import { createRng } from "../src/core/rng.js";
import { drained, makeField, makeWorld, spawn, typesOf } from "./fixtures.js";

describe("移動", () => {
  it("依速度與時間前進", () => {
    const field = makeField();
    const world = makeWorld();
    const unit = spawn(world, "hero", 0);

    move(field, unit, 10, 0, 0.5);
    expect(unit.x).toBeCloseTo(5, 6);
    expect(unit.z).toBe(0);
  });

  it("被地圖邊界擋住", () => {
    const field = makeField();
    const world = makeWorld();
    const unit = spawn(world, "hero", 0, { x: 40, z: 34 });

    move(field, unit, 100, 100, 1);
    expect(unit.x).toBe(44);
    expect(unit.z).toBe(36);
  });

  it("撞到障礙物時被推到邊緣外", () => {
    const field = makeField([{ x: 5, z: 0, r: 2 }]);
    const world = makeWorld();
    const unit = spawn(world, "hero", 0);

    move(field, unit, 10, 0, 0.5);
    expect(Math.hypot(unit.x - 5, unit.z - 0)).toBeCloseTo(2.5, 6);
  });

  it("ignoreObstacles 讓位移技能穿過樹叢", () => {
    const field = makeField([{ x: 5, z: 0, r: 2 }]);
    const world = makeWorld();
    const unit = spawn(world, "hero", 0);

    move(field, unit, 10, 0, 0.5, true);
    expect(unit.x).toBeCloseTo(5, 6);
  });

  it("moving 反映是否真的在動", () => {
    const field = makeField();
    const world = makeWorld();
    const unit = spawn(world, "hero", 0);

    move(field, unit, 10, 0, 0.1);
    expect(unit.moving).toBe(true);

    move(field, unit, 0, 0, 0.1);
    expect(unit.moving).toBe(false);
  });
});

describe("突進", () => {
  it("位移固定距離並短暫無敵", () => {
    const field = makeField();
    const world = makeWorld();
    const unit = spawn(world, "hero", 0);

    dash(world, field, unit, { x: 1, z: 0 }, 6);
    expect(unit.x).toBeCloseTo(6, 6);
    expect(unit.invuln).toBe(0.22);
  });

  it("方向未正規化也沒關係", () => {
    const field = makeField();
    const world = makeWorld();
    const unit = spawn(world, "hero", 0);

    dash(world, field, unit, { x: 30, z: 0 }, 6);
    expect(unit.x).toBeCloseTo(6, 6);
  });

  it("玩家突進會取消點地移動路徑", () => {
    const field = makeField();
    const world = makeWorld();
    const player = spawn(world, "hero", 0, { isPlayer: true });
    world.movePath = [{ x: 20, z: 20 }];

    dash(world, field, player, { x: 1, z: 0 });
    expect(world.movePath).toEqual([]);
  });

  it("trail 進化在起點留下燃燒區域", () => {
    const field = makeField();
    const world = makeWorld();
    const unit = spawn(world, "hero", 0, { x: 3, mods: { trail: true } });

    dash(world, field, unit, { x: 1, z: 0 }, 6);
    expect(world.zones).toHaveLength(1);
    expect(world.zones[0].x).toBe(3);
  });

  it("roll 進化在突進後加快攻速", () => {
    const field = makeField();
    const world = makeWorld();
    const unit = spawn(world, "hero", 0, { mods: { roll: true } });

    dash(world, field, unit, { x: 1, z: 0 });
    expect(unit.boost).toBe(3);
  });

  it("突進會在起點留下光環", () => {
    const field = makeField();
    const world = makeWorld();
    dash(world, field, spawn(world, "hero", 0), { x: 1, z: 0 });
    expect(typesOf(drained(world))).toContain("ring");
  });
});

describe("從障礙物中脫困", () => {
  /** 密集且互相重疊的樹叢，重現原本會卡住的地形。 */
  const cluster = (rng: () => number, count: number) =>
    Array.from({ length: count }, () => ({
      x: rng() * 4 - 2,
      z: rng() * 4 - 2,
      r: 0.65,
    }));

  it("走進密集樹叢後不會卡在樹裡", () => {
    // 地形生成沒有檢查樹與樹的間距，所以樹會互相重疊。原本的單輪推擠
    // 在這種夾角處有一成四的機率把角色留在障礙物內部。
    const rng = createRng(31337);
    let stuck = 0;
    const trials = 1500;

    for (let t = 0; t < trials; t++) {
      const obstacles = cluster(rng, 2 + Math.floor(rng() * 4));
      const field = makeField(obstacles);
      const world = makeWorld();
      const angle = rng() * Math.PI * 2;
      const unit = spawn(world, "hero", 0, {
        x: Math.cos(angle) * 5,
        z: Math.sin(angle) * 5,
      });

      move(field, unit, -Math.cos(angle) * 9, -Math.sin(angle) * 9, 0.6);
      if (
        obstacles.some(
          (o) => Math.hypot(unit.x - o.x, unit.z - o.z) < o.r + 0.48 - 1e-9,
        )
      )
        stuck++;
    }
    expect(stuck).toBe(0);
  });

  it("脫困不會把角色丟出地圖外", () => {
    const obstacles = [{ x: 43.8, z: 35.8, r: 2 }];
    const field = makeField(obstacles);
    const world = makeWorld();
    const unit = spawn(world, "hero", 0, { x: 43, z: 35 });

    move(field, unit, 10, 10, 0.5);
    expect(Math.abs(unit.x)).toBeLessThanOrEqual(44);
    expect(Math.abs(unit.z)).toBeLessThanOrEqual(36);
  });
});
