import { describe, expect, it } from "vitest";
import { damage, kill } from "../src/core/combat.js";
import { drained, makeWorld, spawn, typesOf } from "./fixtures.js";

describe("傷害結算", () => {
  it("直接扣血", () => {
    const world = makeWorld();
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500 });
    damage(world, target, 120, spawn(world, "hero", 0));
    expect(target.hp).toBe(380);
  });

  it("已陣亡的目標不再受傷", () => {
    const world = makeWorld();
    const target = spawn(world, "hero", 1, { hp: 0 });
    damage(world, target, 120, null);
    expect(target.hp).toBe(0);
  });

  it("護盾先擋，擋不住的才扣血", () => {
    const world = makeWorld();
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500, shield: 80 });
    damage(world, target, 120, null);
    expect(target.shield).toBe(0);
    expect(target.hp).toBe(460);
  });

  it("護盾夠厚時血量不動", () => {
    const world = makeWorld();
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500, shield: 300 });
    damage(world, target, 120, null);
    expect(target.shield).toBe(180);
    expect(target.hp).toBe(500);
  });

  it("格擋期間傷害降到 18%", () => {
    const world = makeWorld();
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500, guard: 1.5 });
    damage(world, target, 100, null);
    expect(target.hp).toBeCloseTo(482, 5);
  });

  it("無敵期間完全不受傷", () => {
    const world = makeWorld();
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500, invuln: 0.2 });
    damage(world, target, 400, spawn(world, "hero", 0));
    expect(target.hp).toBe(500);
  });
});

describe("建築的傷害減免", () => {
  it("普攻對防禦塔只有 55%，技能只有 28%", () => {
    const world = makeWorld();
    const attacker = spawn(world, "hero", 0);
    const a = spawn(world, "tower", 1, { hp: 3600, maxHp: 3600, lane: 0 });
    const b = spawn(world, "tower", 1, { hp: 3600, maxHp: 3600, lane: 1 });

    damage(world, a, 100, attacker, false);
    damage(world, b, 100, attacker, true);
    expect(3600 - (a.hp as number)).toBeCloseTo(55, 5);
    expect(3600 - (b.hp as number)).toBeCloseTo(28, 5);
  });

  it("攻城巨獸不吃建築減免，但打核心只有 40%", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", 0);
    const tower = spawn(world, "tower", 1, { hp: 3600, maxHp: 3600 });
    const core = spawn(world, "core", 1, { hp: 6000, maxHp: 6000 });

    damage(world, tower, 100, boss, true);
    expect(3600 - (tower.hp as number)).toBeCloseTo(100, 5);

    damage(world, core, 100, boss, true);
    expect(6000 - (core.hp as number)).toBeCloseTo(40, 5);
  });
});

describe("核心的防禦塔保護", () => {
  const setup = () => {
    const world = makeWorld();
    const core = spawn(world, "core", 1, { hp: 6000, maxHp: 6000 });
    const attacker = spawn(world, "hero", 0);
    return { world, core, attacker };
  };

  it("兩路都還有塔時，核心免疫", () => {
    const { world, core, attacker } = setup();
    spawn(world, "tower", 1, { lane: 0 });
    spawn(world, "tower", 1, { lane: 1 });

    damage(world, core, 500, attacker);
    expect(core.hp).toBe(6000);
  });

  it("清空任一路之後，核心可以被攻擊", () => {
    const { world, core, attacker } = setup();
    spawn(world, "tower", 1, { lane: 0 });
    const doomed = spawn(world, "tower", 1, { lane: 1 });

    damage(world, core, 500, attacker);
    expect(core.hp).toBe(6000);

    doomed.hp = 0;
    damage(world, core, 500, attacker);
    expect(core.hp).toBeLessThan(6000);
  });

  it("完全沒有塔時也可以攻擊", () => {
    const { world, core, attacker } = setup();
    damage(world, core, 500, attacker);
    expect(core.hp).toBeLessThan(6000);
  });

  it("只看同隊的塔，敵方的塔不保護它", () => {
    const { world, core, attacker } = setup();
    spawn(world, "tower", 0, { lane: 0 });
    spawn(world, "tower", 0, { lane: 1 });

    damage(world, core, 500, attacker);
    expect(core.hp).toBeLessThan(6000);
  });
});

describe("進化與裝備的加成", () => {
  it("power 依比例提升傷害", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, { mods: { power: 0.2 } });
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500 });
    damage(world, target, 100, source);
    expect(500 - (target.hp as number)).toBeCloseTo(120, 5);
  });

  it("execute 只對殘血目標生效", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, { mods: { execute: true } });
    const healthy = spawn(world, "hero", 1, { hp: 500, maxHp: 1000 });
    const wounded = spawn(world, "hero", 1, { hp: 300, maxHp: 1000 });

    damage(world, healthy, 100, source);
    damage(world, wounded, 100, source);
    expect(500 - (healthy.hp as number)).toBeCloseTo(100, 5);
    expect(300 - (wounded.hp as number)).toBeCloseTo(140, 5);
  });

  it("combo 只在技能打中緩速目標時生效", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, { mods: { combo: true } });
    const slowed = spawn(world, "hero", 1, { hp: 900, maxHp: 900, slow: 1 });
    const normal = spawn(world, "hero", 1, { hp: 900, maxHp: 900 });

    damage(world, slowed, 100, source, true);
    expect(900 - (slowed.hp as number)).toBeCloseTo(165, 5);

    damage(world, normal, 100, source, true);
    expect(900 - (normal.hp as number)).toBeCloseTo(100, 5);
  });

  it("frost 讓每次攻擊都附帶緩速", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, { mods: { frost: true } });
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500 });
    damage(world, target, 10, source);
    expect(target.slow).toBe(0.7);
  });

  it("frost 不會蓋掉更長的既有緩速", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, { mods: { frost: true } });
    const target = spawn(world, "hero", 1, { hp: 500, maxHp: 500, slow: 3 });
    damage(world, target, 10, source);
    expect(target.slow).toBe(3);
  });

  it("mark 累積四層後引爆並追加 100 傷害", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, { mods: { mark: true } });
    const target = spawn(world, "hero", 1, { hp: 900, maxHp: 900 });

    for (let i = 0; i < 3; i++) damage(world, target, 10, source);
    expect(target.mark).toBe(3);
    expect(900 - (target.hp as number)).toBeCloseTo(30, 5);

    damage(world, target, 10, source);
    expect(target.mark).toBe(0);
    expect(900 - (target.hp as number)).toBeCloseTo(140, 5);
  });

  it("mark 不會累積在建築上", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, { mods: { mark: true } });
    const tower = spawn(world, "tower", 1, { hp: 3600, maxHp: 3600 });
    for (let i = 0; i < 5; i++) damage(world, tower, 10, source);
    expect(tower.mark).toBeUndefined();
  });

  it("leech 把 12% 傷害轉為生命，且不超過上限", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, {
      hp: 500,
      maxHp: 1000,
      mods: { leech: true },
    });
    const target = spawn(world, "hero", 1, { hp: 900, maxHp: 900 });

    damage(world, target, 100, source);
    expect(source.hp).toBeCloseTo(512, 5);

    source.hp = 995;
    damage(world, target, 100, source);
    expect(source.hp).toBe(1000);
  });

  it("reflect 在格擋期間反傷，且不會把對手打死", () => {
    const world = makeWorld();
    const attacker = spawn(world, "hero", 0, { hp: 20, maxHp: 1000 });
    const target = spawn(world, "hero", 1, {
      hp: 900,
      maxHp: 900,
      guard: 1,
      mods: { reflect: true },
    });

    damage(world, target, 100, attacker);
    expect(attacker.hp).toBe(1);
  });

  it("對無敵且格擋中的目標攻擊，不會觸發反傷", () => {
    const world = makeWorld();
    const attacker = spawn(world, "hero", 0, { hp: 500, maxHp: 1000 });
    const target = spawn(world, "hero", 1, {
      hp: 900,
      maxHp: 900,
      guard: 1,
      invuln: 0.2,
      mods: { reflect: true },
    });

    damage(world, target, 100, attacker);
    expect(target.hp).toBe(900);
    expect(attacker.hp).toBe(500);
    // 這一擊完全不存在，連特效都不該產生。
    expect(drained(world)).toEqual([]);
  });
});

describe("防禦塔的仇恨轉移", () => {
  it("英雄攻擊英雄時，守方範圍內的塔會記下攻擊者", () => {
    const world = makeWorld();
    const attacker = spawn(world, "hero", 0);
    const victim = spawn(world, "hero", 1, { hp: 900, maxHp: 900 });
    const nearTower = spawn(world, "tower", 1, { x: 5, range: 11 });
    const farTower = spawn(world, "tower", 1, { x: 40, range: 11 });

    damage(world, victim, 50, attacker);
    expect(nearTower.aggro).toBe(attacker.id);
    expect(farTower.aggro).toBeUndefined();
  });

  it("打小兵不會引來塔的仇恨", () => {
    const world = makeWorld();
    const attacker = spawn(world, "hero", 0);
    const minion = spawn(world, "minion", 1, { hp: 200, maxHp: 200 });
    const tower = spawn(world, "tower", 1, { x: 5, range: 11 });

    damage(world, minion, 50, attacker);
    expect(tower.aggro).toBeUndefined();
  });
});

describe("傷害數字", () => {
  it("只在玩家出手或受擊時產生", () => {
    const world = makeWorld();
    const player = spawn(world, "hero", 0, { isPlayer: true });
    const ally = spawn(world, "hero", 0);
    const foe = spawn(world, "hero", 1, { hp: 900, maxHp: 900 });
    const other = spawn(world, "hero", 1, { hp: 900, maxHp: 900 });

    damage(world, foe, 50, player);
    expect(typesOf(drained(world))).toContain("damage");

    damage(world, other, 50, ally);
    expect(typesOf(drained(world))).not.toContain("damage");

    damage(world, player, 50, ally);
    expect(typesOf(drained(world))).toContain("damage");
  });
});

describe("無敵的涵蓋範圍", () => {
  it("無敵期間不會被上緩速，也不會累積 mark", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, {
      mods: { frost: true, mark: true },
    });
    const target = spawn(world, "hero", 1, {
      hp: 900,
      maxHp: 900,
      invuln: 0.2,
    });

    damage(world, target, 100, source);
    expect(target.slow).toBe(0);
    expect(target.mark).toBeUndefined();
  });

  it("無敵期間不會讓攻擊者吸血", () => {
    const world = makeWorld();
    const source = spawn(world, "hero", 0, {
      hp: 500,
      maxHp: 1000,
      mods: { leech: true },
    });
    const target = spawn(world, "hero", 1, {
      hp: 900,
      maxHp: 900,
      invuln: 0.2,
    });

    damage(world, target, 100, source);
    expect(source.hp).toBe(500);
  });

  it("無敵期間不會引來防禦塔的仇恨", () => {
    const world = makeWorld();
    const attacker = spawn(world, "hero", 0);
    const victim = spawn(world, "hero", 1, {
      hp: 900,
      maxHp: 900,
      invuln: 0.2,
    });
    const tower = spawn(world, "tower", 1, { x: 5, range: 11 });

    damage(world, victim, 50, attacker);
    expect(tower.aggro).toBeUndefined();
  });
});
