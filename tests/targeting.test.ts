import { describe, expect, it } from "vitest";
import { enemies, targetFor } from "../src/core/targeting.js";
import { makeWorld, spawn } from "./fixtures.js";

describe("選敵範圍", () => {
  it("只挑敵對、活著、在範圍內的單位", () => {
    const world = makeWorld();
    const me = spawn(world, "hero", 0);
    const foe = spawn(world, "minion", 1, { x: 3 });
    spawn(world, "minion", 0, { x: 3 }); // 同隊
    spawn(world, "minion", 1, { x: 3, hp: 0 }); // 已死
    spawn(world, "minion", 1, { x: 50 }); // 太遠

    expect(enemies(world, me, 10)).toEqual([foe]);
  });

  it("不會把自己算進去", () => {
    const world = makeWorld();
    const me = spawn(world, "hero", 0);
    expect(enemies(world, me, 10)).toEqual([]);
  });

  it("中立巨獸只有英雄看得見", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", -1, { x: 2 });
    const hero = spawn(world, "hero", 0);
    const minion = spawn(world, "minion", 0);
    const tower = spawn(world, "tower", 0);

    expect(enemies(world, hero, 10)).toContain(boss);
    expect(enemies(world, minion, 10)).not.toContain(boss);
    expect(enemies(world, tower, 20)).not.toContain(boss);
  });
});

describe("目標優先權", () => {
  it("英雄優先於小兵，小兵優先於建築", () => {
    const world = makeWorld();
    const me = spawn(world, "hero", 0);
    const tower = spawn(world, "tower", 1, { x: 1 });
    const minion = spawn(world, "minion", 1, { x: 2 });
    const hero = spawn(world, "hero", 1, { x: 3 });

    expect(targetFor(world, me, 20)).toBe(hero);
    hero.hp = 0;
    expect(targetFor(world, me, 20)).toBe(minion);
    minion.hp = 0;
    expect(targetFor(world, me, 20)).toBe(tower);
  });

  it("巨獸排在最後，避免被中立怪拉走注意力", () => {
    const world = makeWorld();
    const me = spawn(world, "hero", 0);
    spawn(world, "boss", -1, { x: 1 });
    const tower = spawn(world, "tower", 1, { x: 8 });

    expect(targetFor(world, me, 20)).toBe(tower);
  });

  it("同優先權取比較近的", () => {
    const world = makeWorld();
    const me = spawn(world, "hero", 0);
    spawn(world, "minion", 1, { x: 9 });
    const near = spawn(world, "minion", 1, { x: 2 });

    expect(targetFor(world, me, 20)).toBe(near);
  });

  it("超出範圍就沒有目標", () => {
    const world = makeWorld();
    const me = spawn(world, "hero", 0);
    spawn(world, "minion", 1, { x: 30 });
    expect(targetFor(world, me, 20)).toBeUndefined();
  });
});

describe("防禦塔的目標優先權", () => {
  it("優先打被記上仇恨的英雄，即使小兵更近", () => {
    const world = makeWorld();
    const tower = spawn(world, "tower", 0);
    spawn(world, "minion", 1, { x: 1 });
    const raider = spawn(world, "hero", 1, { x: 9 });
    tower.aggro = raider.id;

    expect(targetFor(world, tower, 20)).toBe(raider);
  });

  it("沒有仇恨目標時先打小兵，免得被兵線綁住", () => {
    const world = makeWorld();
    const tower = spawn(world, "tower", 0);
    const minion = spawn(world, "minion", 1, { x: 9 });
    spawn(world, "hero", 1, { x: 1 });

    expect(targetFor(world, tower, 20)).toBe(minion);
  });
});
