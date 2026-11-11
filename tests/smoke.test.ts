import { describe, expect, it } from "vitest";
import { HEROES } from "../src/data/heroes.js";
import { commonUpgrades, heroUpgrades } from "../src/data/evolutions.js";
import { makeWorld, spawn } from "./fixtures.js";

describe("遊戲資料", () => {
  it("有四位英雄，每位三個技能與三段冷卻", () => {
    expect(HEROES).toHaveLength(4);
    for (const h of HEROES) {
      expect(h.skills).toHaveLength(3);
      expect(h.symbols).toHaveLength(3);
      expect(h.cd).toHaveLength(3);
    }
  });

  it("每位英雄實際看到的進化池內，id 不重複", () => {
    // 注意：id 只在單一英雄的池內唯一，並非全域唯一。
    // 射手的 bounce（連鎖飛矢）與法師的 bounce（電弧法球）刻意共用同一個
    // mods 旗標，因為一局只玩一位英雄，兩者不會同時進池。
    expect(heroUpgrades).toHaveLength(4);
    for (const own of heroUpgrades) {
      const ids = [...commonUpgrades, ...own].map((u) => u.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("進化的 apply() 只改動傳入的實體", () => {
    const entity = spawn(makeWorld(), "hero", 0, { maxHp: 1000, hp: 500 });
    const vital = commonUpgrades.find((u) => u.id === "vital");
    expect(vital).toBeDefined();
    vital!.apply(entity);
    expect(entity.maxHp).toBe(1350);
    expect(entity.hp).toBe(1350);
  });
});
