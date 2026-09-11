import { describe, expect, it } from "vitest";
import { createWorld } from "../src/core/world.js";

describe("戰局容器", () => {
  it("新戰局的初始值符合開局狀態", () => {
    const world = createWorld();
    expect(world.entities).toEqual([]);
    expect(world.player).toBeNull();
    expect(world.boss).toBeNull();
    expect(world.capture).toBeNull();
    expect(world.scores).toEqual([0, 0]);
    expect(world.time).toBe(0);
    expect(world.bossAt).toBe(180);
    expect(world.rerolls).toBe(2);
    expect(world.nextId).toBe(1);
  });

  it("每個戰局各自獨立，不共用陣列", () => {
    const a = createWorld();
    const b = createWorld();

    a.entities.push({ id: 1 } as never);
    a.scores[0] = 5;
    a.chosen.push({ id: "x", name: "x", icon: "x", desc: "x" });
    a.movePath.push({ x: 1, z: 1 });

    expect(b.entities).toHaveLength(0);
    expect(b.scores).toEqual([0, 0]);
    expect(b.chosen).toHaveLength(0);
    expect(b.movePath).toHaveLength(0);
  });

  it("容器裡沒有呈現層的東西", () => {
    // 特效、傷害數字、鏡頭、音訊、UI 狀態機都屬於呈現層。
    // 它們一旦混進來，戰鬥邏輯就又搬不出瀏覽器了。
    const keys = Object.keys(createWorld());
    for (const forbidden of [
      "effects",
      "floaters",
      "state",
      "viewTarget",
      "audioCtx",
      "muted",
      "scene",
      "camera",
    ])
      expect(keys).not.toContain(forbidden);
  });
});
