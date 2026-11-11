/**
 * #7 與 #10 相乘的迴歸測試。
 *
 * 這兩個缺陷單獨存在都不致命：推擠偶爾把人留在樹裡，而規劃從障礙物內部
 * 算不出路。合起來卻是完整的功能失效 —— 角色卡進樹叢後右鍵完全失靈，
 * 而遊戲還顯示「這個位置無法抵達」，把玩家指向錯誤的方向。
 */
import { describe, expect, it } from "vitest";
import { move } from "../src/core/movement.js";
import { createNavigation } from "../src/core/navigation.js";
import { createRng } from "../src/core/rng.js";
import { makeField, makeWorld, spawn } from "./fixtures.js";

describe("卡進樹叢後仍能操作", () => {
  it("走進密集樹叢一千次，每次都還能規劃出移動路徑", () => {
    const rng = createRng(90210);
    let planned = 0;
    const trials = 1000;

    for (let t = 0; t < trials; t++) {
      const obstacles = Array.from(
        { length: 2 + Math.floor(rng() * 5) },
        () => ({ x: rng() * 4 - 2, z: rng() * 4 - 2, r: 0.65 }),
      );
      const field = makeField(obstacles);
      const world = makeWorld();
      const angle = rng() * Math.PI * 2;
      const unit = spawn(world, "hero", 0, {
        x: Math.cos(angle) * 5,
        z: Math.sin(angle) * 5,
      });

      // 直直走進樹叢
      move(field, unit, -Math.cos(angle) * 9, -Math.sin(angle) * 9, 0.6);
      // 然後右鍵點一個遠處的空地
      if (field.navigation.planPath(unit, { x: 20, z: 20 }).length) planned++;
    }
    expect(planned).toBe(trials);
  });

  it("就算真的站在障礙物正中央，也規劃得出路", () => {
    const nav = createNavigation([{ x: 0, z: 0, r: 3 }]);
    for (const to of [
      { x: 20, z: 20 },
      { x: -20, z: 5 },
      { x: 0, z: -25 },
    ])
      expect(nav.planPath({ x: 0, z: 0 }, to).length).toBeGreaterThan(0);
  });
});
