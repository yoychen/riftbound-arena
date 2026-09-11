import { describe, expect, it } from "vitest";
import { dash, move } from "../src/core/movement.js";
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
