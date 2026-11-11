import { describe, expect, it } from "vitest";
import { commonUpgrades, heroUpgrades } from "../src/data/evolutions.js";
import { makeWorld, spawn } from "./fixtures.js";

describe("進化定義", () => {
  it("id 全域唯一（既知問題 #9）", () => {
    // 抽選用 id 去重、判斷「英雄專屬」也比對 id。目前一局只取單一英雄的池，
    // 重複不會出事，但這個前提一變就會靜默壞掉 —— 讓它在測試裡紅。
    const ids = [...commonUpgrades, ...heroUpgrades.flat()].map((u) => u.id);
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(duplicates).toEqual([]);
  });

  it("射手與法師的彈射進化仍然打開同一個 bounce 效果", () => {
    for (const id of ["chainArrow", "arcOrb"]) {
      const upgrade = heroUpgrades.flat().find((u) => u.id === id)!;
      const hero = spawn(makeWorld(), "hero", 0);
      upgrade.apply(hero);
      expect(hero.mods.bounce).toBe(true);
    }
  });
});
