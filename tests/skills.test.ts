import { describe, expect, it } from "vitest";
import { aimDirection, attack, cast } from "../src/core/skills.js";
import { HEROES } from "../src/data/heroes.js";
import { drained, makeField, makeWorld, spawn, typesOf } from "./fixtures.js";

const field = makeField();

/** 單位化，方便和 aimDirection 的回傳比較方向。 */
const unit = (v: { x: number; z: number }) => {
  const l = Math.hypot(v.x, v.z);
  return { x: v.x / l, z: v.z / l };
};

describe("瞄準方向", () => {
  it("玩家用滑鼠瞄準時朝向游標", () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
    const player = spawn(world, "hero", 0, { isPlayer: true });
    expect(unit(aimDirection(world, player))).toEqual({ x: 1, z: 0 });
  });

  it("自動瞄準時鎖定最近的敵人", () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: true });
    const player = spawn(world, "hero", 0, { isPlayer: true });
    spawn(world, "minion", 1, { z: 5 });
    expect(unit(aimDirection(world, player))).toEqual({ x: 0, z: 1 });
  });

  it("自動瞄準但附近沒有敵人時，退回游標方向", () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: true });
    const player = spawn(world, "hero", 0, { isPlayer: true });
    expect(unit(aimDirection(world, player))).toEqual({ x: 1, z: 0 });
  });

  it("AI 沒有目標時維持原本的面向", () => {
    const world = makeWorld();
    const bot = spawn(world, "hero", 1, { facing: Math.PI / 2 });
    const d = unit(aimDirection(world, bot));
    expect(d.x).toBeCloseTo(1, 6);
    expect(d.z).toBeCloseTo(0, 6);
  });
});

describe("普攻", () => {
  const meleeWorld = () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
    const hero = spawn(world, "hero", 0, { isPlayer: true });
    return { world, hero };
  };

  it("近戰打得到面前的敵人", () => {
    const { world, hero } = meleeWorld();
    const front = spawn(world, "minion", 1, { x: 2, hp: 300, maxHp: 300 });
    attack(world, hero);
    expect(front.hp).toBeLessThan(300);
  });

  it("近戰打不到背後的敵人", () => {
    const { world, hero } = meleeWorld();
    const behind = spawn(world, "minion", 1, { x: -2, hp: 300, maxHp: 300 });
    attack(world, hero);
    expect(behind.hp).toBe(300);
  });

  it("遠程發射投射物而非直接造成傷害", () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
    const archer = spawn(world, "hero", 0, { hero: 1, range: 14, isPlayer: true });
    const target = spawn(world, "minion", 1, { x: 5, hp: 300, maxHp: 300 });

    attack(world, archer);
    expect(world.projectiles).toHaveLength(1);
    expect(target.hp).toBe(300);
  });

  it("split 進化讓遠程一次射出三發", () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
    const archer = spawn(world, "hero", 0, {
      hero: 1,
      range: 14,
      isPlayer: true,
      mods: { split: true },
    });
    attack(world, archer);
    expect(world.projectiles).toHaveLength(3);
  });

  it("blade 進化讓近戰額外射出一道劍氣", () => {
    const { world, hero } = meleeWorld();
    hero.mods = { blade: true };
    attack(world, hero);
    expect(world.projectiles).toHaveLength(1);
    expect(world.projectiles[0].pierce).toBe(true);
  });

  it("冷卻中、暈眩中、陣亡時都不能攻擊", () => {
    for (const state of [{ attack: 0.3 }, { stun: 1 }, { hp: 0 }]) {
      const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
      const hero = spawn(world, "hero", 0, { isPlayer: true, ...state });
      const target = spawn(world, "minion", 1, { x: 2, hp: 300, maxHp: 300 });
      attack(world, hero);
      expect(target.hp).toBe(300);
    }
  });

  it("攻擊間隔依兵種而定，boost 期間加快", () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
    const hero = spawn(world, "hero", 0);
    const boosted = spawn(world, "hero", 0, { boost: 2 });
    const minion = spawn(world, "minion", 0);
    const tower = spawn(world, "tower", 0);

    for (const unit of [hero, boosted, minion, tower]) attack(world, unit);
    expect(hero.attack).toBeCloseTo(HEROES[0].rate, 6);
    expect(boosted.attack).toBeCloseTo(HEROES[0].rate / 1.65, 6);
    expect(minion.attack).toBe(1.1);
    expect(tower.attack).toBe(1.25);
  });

  it("只有玩家的攻擊會出聲", () => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
    const player = spawn(world, "hero", 0, { isPlayer: true });
    attack(world, player);
    expect(typesOf(drained(world))).toContain("sound");

    const bot = spawn(world, "hero", 0);
    attack(world, bot);
    expect(typesOf(drained(world))).not.toContain("sound");
  });
});

describe("技能施放的共通規則", () => {
  const setup = (extra: Record<string, unknown> = {}) => {
    const world = makeWorld({ aim: { x: 10, z: 0 }, autoAim: false });
    const hero = spawn(world, "hero", 0, { isPlayer: true, ...extra });
    return { world, hero };
  };

  it("冷卻中不能再放", () => {
    const { world, hero } = setup();
    hero.cd = [3, 0, 0, 0];
    cast(world, field, hero, 0);
    expect((hero.cd as number[])[0]).toBe(3);
    expect(typesOf(drained(world))).not.toContain("sound");
  });

  it("暈眩中與陣亡時不能放", () => {
    for (const state of [{ stun: 1 }, { hp: 0 }]) {
      const { world, hero } = setup(state);
      cast(world, field, hero, 0);
      expect((hero.cd as number[])[0]).toBe(0);
    }
  });

  it("施放後進入冷卻，haste 進化縮短 22%", () => {
    const a = setup();
    cast(a.world, field, a.hero, 1);
    expect((a.hero.cd as number[])[1]).toBeCloseTo(HEROES[0].cd[1], 6);

    const b = setup({ mods: { haste: true } });
    cast(b.world, field, b.hero, 1);
    expect((b.hero.cd as number[])[1]).toBeCloseTo(HEROES[0].cd[1] * 0.78, 6);
  });

  it("閃避有固定冷卻，並讓角色短暫無敵", () => {
    const { world, hero } = setup();
    cast(world, field, hero, 3);
    expect((hero.cd as number[])[3]).toBe(4.5);
    expect(hero.invuln).toBe(0.22);
    expect(hero.x).toBeCloseTo(5.5, 6);
  });

  it("施放會讓角色轉向目標方向", () => {
    const { world, hero } = setup();
    world.aim = { x: 0, z: 10 };
    cast(world, field, hero, 1);
    expect(hero.facing).toBeCloseTo(0, 6);
  });

  it("落點超過射程時被拉回射程邊緣", () => {
    const world = makeWorld({ aim: { x: 40, z: 0 }, autoAim: false });
    const mage = spawn(world, "hero", 0, { hero: 2, isPlayer: true });
    cast(world, field, mage, 1); // 烈焰印記落在指定位置
    expect(world.zones[0].x).toBeCloseTo(13, 6);
  });
});

describe("各英雄的技能效果", () => {
  const cast0 = (heroIndex: number, slot: number, extra = {}) => {
    const world = makeWorld({ aim: { x: 8, z: 0 }, autoAim: false });
    const hero = spawn(world, "hero", 0, {
      hero: heroIndex,
      range: HEROES[heroIndex].range,
      isPlayer: true,
      ...extra,
    });
    return { world, hero, run: () => cast(world, field, hero, slot) };
  };

  it("疾風斬突進並劈中沿途的敵人", () => {
    const { world, hero, run } = cast0(0, 0);
    const onPath = spawn(world, "minion", 1, { x: 4, hp: 300, maxHp: 300 });
    run();
    expect(hero.x).toBeCloseTo(6, 6);
    expect(onPath.hp).toBeLessThan(300);
  });

  it("鏡心格擋同時給減傷與護盾", () => {
    const { hero, run } = cast0(0, 1);
    run();
    expect(hero.guard).toBe(1.8);
    expect(hero.shield).toBe(90);
  });

  it("千刃風暴在腳下放置範圍傷害，mega 進化擴大半徑", () => {
    const plain = cast0(0, 2);
    plain.run();
    expect(plain.world.zones[0].r).toBe(6);
    expect(plain.hero.guard).toBe(1.2);

    const mega = cast0(0, 2, { mods: { mega: true } });
    mega.run();
    expect(mega.world.zones[0].r).toBe(9);
  });

  it("穿星箭是穿透彈，fan 進化再加兩發", () => {
    const plain = cast0(1, 0);
    plain.run();
    expect(plain.world.projectiles).toHaveLength(1);
    expect(plain.world.projectiles[0].pierce).toBe(true);

    const fan = cast0(1, 0, { mods: { fan: true } });
    fan.run();
    expect(fan.world.projectiles).toHaveLength(3);
  });

  it("靈巧翻滾往後拉開距離並加快攻速", () => {
    const { hero, run } = cast0(1, 1);
    run();
    expect(hero.x).toBeCloseTo(-6, 6);
    expect(hero.boost).toBe(3);
  });

  it("寒霜法球附帶緩速", () => {
    const { world, run } = cast0(2, 0);
    run();
    expect(world.projectiles[0].slow).toBe(3);
  });

  it("烈焰印記是短延遲的高傷害小範圍", () => {
    const { world, run } = cast0(2, 1);
    run();
    expect(world.zones[0].dmg).toBe(235);
    expect(world.zones[0].r).toBe(4.5);
  });

  it("山崩衝撞造成暈眩並把敵人推開", () => {
    const { world, run } = cast0(3, 0);
    const victim = spawn(world, "minion", 1, { x: 7, hp: 400, maxHp: 400 });
    run();
    expect(victim.stun).toBe(1.2);
    expect(victim.x).toBeGreaterThan(7);
    expect(victim.hp).toBeLessThan(400);
  });

  it("震地護盾的護盾量受 fortress 進化加成", () => {
    const plain = cast0(3, 1);
    plain.run();
    expect(plain.hero.shield).toBe(300);

    const fortress = cast0(3, 1, { mods: { fortress: true } });
    fortress.run();
    expect(fortress.hero.shield).toBe(500);
  });

  it("大地崩裂同時暈眩與給自己護盾", () => {
    const { world, hero, run } = cast0(3, 2);
    run();
    expect(world.zones[0].stun).toBe(2);
    expect(hero.shield).toBe(250);
  });
});
