import { describe, expect, it } from "vitest";
import { createUnit } from "../src/core/entities.js";
import { HEROES } from "../src/data/heroes.js";
import { makeWorld } from "./fixtures.js";

describe("單位建立", () => {
  it("英雄沿用所選英雄的數值", () => {
    const world = makeWorld();
    const hero = createUnit(world, "hero", 0, 1, 2, 3);
    const data = HEROES[3];

    expect(hero.hp).toBe(data.hp);
    expect(hero.maxHp).toBe(data.hp);
    expect(hero.damage).toBe(data.damage);
    expect(hero.range).toBe(data.range);
    expect(hero.speed).toBe(data.speed);
  });

  it("建築與巨獸有固定數值", () => {
    const world = makeWorld();
    expect(createUnit(world, "tower", 0, 0, 0).hp).toBe(3600);
    expect(createUnit(world, "core", 0, 0, 0).hp).toBe(6000);
    expect(createUnit(world, "boss", -1, 0, 0).hp).toBe(3800);
    expect(createUnit(world, "boss", -1, 0, 0).speed).toBe(3);
  });

  it("小兵隨戰鬥時間變強", () => {
    const early = createUnit(makeWorld({ time: 0 }), "minion", 0, 0, 0);
    const late = createUnit(makeWorld({ time: 600 }), "minion", 0, 0, 0);

    expect(early.hp).toBe(240);
    expect(early.damage).toBe(22);
    expect(late.hp).toBeCloseTo(348, 5);
    expect(late.damage).toBeCloseTo(32.8, 5);
  });

  it("進度起點依隊伍而定，兩隊從兵線兩端推進", () => {
    const world = makeWorld();
    expect(createUnit(world, "minion", 0, 0, 0).progress).toBe(0);
    expect(createUnit(world, "minion", 1, 0, 0).progress).toBe(1);
  });

  it("id 遞增且不重複", () => {
    const world = makeWorld();
    const ids = [0, 1, 2].map(() => createUnit(world, "minion", 0, 0, 0).id);
    expect(ids).toEqual([1, 2, 3]);
    expect(world.nextId).toBe(4);
  });

  it("建立後就在戰局裡", () => {
    const world = makeWorld();
    const unit = createUnit(world, "hero", 0, 0, 0);
    expect(world.entities).toContain(unit);
  });

  it("實體不帶模型，呈現層才掛上去", () => {
    const world = makeWorld();
    expect(createUnit(world, "hero", 0, 0, 0).model).toBeUndefined();
  });
});
