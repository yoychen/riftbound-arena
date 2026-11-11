import { describe, expect, it } from "vitest";
import { shoot } from "../src/core/combat.js";
import { stepProjectiles } from "../src/core/projectiles.js";
import { drained, makeWorld, spawn, typesOf } from "./fixtures.js";

/** 一位在原點朝 +x 開火的射手，與一個在指定位置的敵方英雄。 */
function duel(targetX: number, targetZ = 0, shot = {}) {
  const world = makeWorld();
  const shooter = spawn(world, "hero", 0, { hero: 1, damage: 50, range: 20 });
  const target = spawn(world, "hero", 1, { x: targetX, z: targetZ, hp: 500, maxHp: 500 });
  shoot(world, shooter, { x: 1, z: 0 }, shot);
  drained(world);
  return { world, shooter, target, p: world.projectiles[0]! };
}

describe("投射物飛行", () => {
  it("每幀前進 speed × dt，並扣掉剩餘射程", () => {
    const { world, p } = duel(100);
    stepProjectiles(world, 0.1);
    expect(p.x).toBeCloseTo(2.8, 5);
    expect(p.left).toBeCloseTo(17.2, 5);
  });

  it("飛行線段掃過的目標會被命中（不會因為一幀跳太遠而穿過）", () => {
    const { world, target, p } = duel(5);
    stepProjectiles(world, 0.5); // 一幀飛 14，遠超過目標位置
    expect(target.hp).toBe(450);
    expect(p.left).toBeLessThanOrEqual(0);
    expect(typesOf(drained(world))).toContain("burst");
  });

  it("偏離彈道太遠的目標不受傷", () => {
    const { world, target } = duel(5, 3);
    stepProjectiles(world, 0.5);
    expect(target.hp).toBe(500);
  });

  it("不打友軍，也不打自己", () => {
    const world = makeWorld();
    const shooter = spawn(world, "hero", 0, { damage: 50, range: 20 });
    const ally = spawn(world, "hero", 0, { x: 3, hp: 500 });
    shoot(world, shooter, { x: 1, z: 0 });
    stepProjectiles(world, 0.5);
    expect(ally.hp).toBe(500);
    expect(shooter.hp).toBe(shooter.maxHp);
  });
});

describe("dt === 0 的邊界（既知問題 #6）", () => {
  it("零長度線段退化成點判定：貼臉的敵人仍被命中", () => {
    const { world, target, p } = duel(0.5);
    stepProjectiles(world, 0);
    expect(target.hp).toBe(450);
    expect(p.left).toBeLessThanOrEqual(0);
  });

  it("零長度線段不產生 NaN 座標", () => {
    const { world, p } = duel(100);
    stepProjectiles(world, 0);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.z)).toBe(true);
    expect(p.left).toBe(20);
  });

  it("dt === 0 時遠處的敵人不受傷", () => {
    const { world, target } = duel(5);
    stepProjectiles(world, 0);
    expect(target.hp).toBe(500);
  });
});

describe("穿透與彈射", () => {
  it("穿透：同一幀打穿整排，每個目標只算一次", () => {
    const world = makeWorld();
    const shooter = spawn(world, "hero", 0, { damage: 50, range: 20 });
    const a = spawn(world, "minion", 1, { x: 3 });
    const b = spawn(world, "minion", 1, { x: 6 });
    const hpA = a.hp;
    const hpB = b.hp;
    shoot(world, shooter, { x: 1, z: 0 }, { pierce: true });
    const p = world.projectiles[0]!;
    stepProjectiles(world, 0.5);
    stepProjectiles(world, 0.01);
    expect(a.hp).toBeLessThan(hpA);
    expect(b.hp).toBeLessThan(hpB);
    expect(p.hit.size).toBe(2);
    expect(p.left).toBeGreaterThan(0);
  });

  it("彈射：命中後轉向最近的下一個敵人，只彈一次", () => {
    const world = makeWorld();
    const shooter = spawn(world, "hero", 0, { damage: 50, range: 20 });
    const first = spawn(world, "hero", 1, { x: 3, hp: 500 });
    const near = spawn(world, "hero", 1, { x: 3, z: 4, hp: 500 });
    spawn(world, "hero", 1, { x: 3, z: -6, hp: 500 });
    shoot(world, shooter, { x: 1, z: 0 }, { bounce: true });
    const p = world.projectiles[0]!;
    stepProjectiles(world, 0.2);
    expect(first.hp).toBe(450);
    expect(p.bounce).toBe(false);
    expect(p.left).toBe(8);
    expect(p.dx).toBeCloseTo(0, 5);
    expect(p.dz).toBeCloseTo(1, 5);
    stepProjectiles(world, 0.2);
    expect(near.hp).toBe(450);
  });

  it("彈射目標與命中點重合時沿用原方向，不產生 NaN", () => {
    const world = makeWorld();
    const shooter = spawn(world, "hero", 0, { damage: 50, range: 20 });
    spawn(world, "hero", 1, { x: 3, hp: 500 });
    const stacked = spawn(world, "hero", 1, { x: 3, hp: 500 });
    shoot(world, shooter, { x: 1, z: 0 }, { bounce: true });
    const p = world.projectiles[0]!;
    stepProjectiles(world, 0.2);
    expect(p.dx).toBe(1);
    expect(p.dz).toBe(0);
    stepProjectiles(world, 0);
    expect(stacked.hp).toBe(450);
  });

  it("命中後套用緩速", () => {
    const { world, target } = duel(5, 0, { slow: 1.5 });
    stepProjectiles(world, 0.5);
    expect(target.slow).toBe(1.5);
  });
});
