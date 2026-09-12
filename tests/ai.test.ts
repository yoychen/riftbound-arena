import { describe, expect, it } from "vitest";
import { ai } from "../src/core/ai.js";
import { drained, makeField, makeWorld, spawn, typesOf } from "./fixtures.js";

const field = makeField();
const DT = 0.1;

describe("共通", () => {
  it("暈眩中完全不動作", () => {
    const world = makeWorld();
    const unit = spawn(world, "minion", 0, { x: -30, stun: 1 });
    ai(world, field, unit, DT);
    expect(unit.x).toBe(-30);
    expect(world.projectiles).toHaveLength(0);
  });

  it("緩速讓移動距離減半", () => {
    const fast = makeWorld();
    const a = spawn(fast, "minion", 0, { x: -30, lane: 0, z: -20 });
    ai(fast, field, a, 1);

    const slowed = makeWorld();
    const b = spawn(slowed, "minion", 0, { x: -30, lane: 0, z: -20, slow: 1 });
    ai(slowed, field, b, 1);

    expect(a.x + 30).toBeCloseTo((b.x + 30) * 2, 4);
  });
});

describe("防禦塔與核心", () => {
  it("射程內有敵人就開火，且不會移動", () => {
    const world = makeWorld();
    const tower = spawn(world, "tower", 0, { x: 0, z: 0 });
    spawn(world, "minion", 1, { x: 5 });

    ai(world, field, tower, DT);
    expect(world.projectiles).toHaveLength(1);
    expect(tower.x).toBe(0);
    expect(tower.attack).toBe(1.15);
  });

  it("敵人在射程外就不開火", () => {
    const world = makeWorld();
    const tower = spawn(world, "tower", 0);
    spawn(world, "minion", 1, { x: 30 });

    ai(world, field, tower, DT);
    expect(world.projectiles).toHaveLength(0);
  });

  it("冷卻未結束時不會連射", () => {
    const world = makeWorld();
    const tower = spawn(world, "tower", 0, { attack: 0.5 });
    spawn(world, "minion", 1, { x: 5 });

    ai(world, field, tower, DT);
    expect(world.projectiles).toHaveLength(0);
  });

  it("核心的射擊間隔比防禦塔長", () => {
    const world = makeWorld();
    const core = spawn(world, "core", 0);
    spawn(world, "minion", 1, { x: 5 });

    ai(world, field, core, DT);
    expect(core.attack).toBe(1.5);
  });
});

describe("中立巨獸", () => {
  it("沒有敵人時待在巢穴", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", -1, { x: 20, z: 0 });

    ai(world, field, boss, 1);
    expect(boss.x).toBeLessThan(20);
  });

  it("有人靠近巢穴就砸下範圍傷害", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", -1, { x: 1, z: 0 });
    spawn(world, "hero", 0, { x: 3 });

    ai(world, field, boss, DT);
    expect(world.zones).toHaveLength(1);
    expect(world.zones[0].dmg).toBe(160);
  });

  it("敵人離巢穴太遠就不追", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", -1, { x: 20, z: 0 });
    spawn(world, "hero", 0, { x: 22 });

    ai(world, field, boss, DT);
    expect(world.zones).toHaveLength(0);
  });
});

describe("英雄", () => {
  const hero = (world: ReturnType<typeof makeWorld>, extra = {}) =>
    spawn(world, "hero", 0, { x: 0, z: -20, lane: 0, ...extra });

  it("殘血時撤回基地", () => {
    const world = makeWorld();
    const unit = hero(world, { hp: 100, maxHp: 1000 });
    ai(world, field, unit, 1);
    expect(unit.x).toBeLessThan(0);
    expect(unit.z).toBeGreaterThan(-20);
  });

  it("在基地附近會待到補滿八成才出門", () => {
    const world = makeWorld();
    const unit = hero(world, { x: -34, z: 25, hp: 700, maxHp: 1000 });
    ai(world, field, unit, 1);
    expect(Math.hypot(unit.x + 34, unit.z - 25)).toBeLessThan(1.5);
  });

  it("聽從我方的集合指令", () => {
    const world = makeWorld({ time: 5 });
    world.ping = { x: 20, z: -20, until: 100 };
    const unit = hero(world);

    ai(world, field, unit, 1);
    expect(unit.x).toBeGreaterThan(0);
  });

  it("敵方英雄不會聽我方的集合指令", () => {
    const world = makeWorld({ time: 5 });
    world.ping = { x: 20, z: -20, until: 100 };
    const unit = spawn(world, "hero", 1, { x: 0, z: -20, lane: 0 });

    ai(world, field, unit, 1);
    // 紅方沿兵線往 x 遞減的方向推進，而不是往集合點。
    expect(unit.x).toBeLessThan(0);
  });

  it("自己這隊在收服巨獸時回到巢穴", () => {
    const world = makeWorld({ time: 5 });
    world.capture = { team: 0, value: 1 };
    const unit = hero(world);

    ai(world, field, unit, 1);
    expect(unit.z).toBeGreaterThan(-20);
  });

  it("巨獸甦醒時前往中路爭奪", () => {
    const world = makeWorld({ time: 100 });
    world.boss = spawn(world, "boss", -1, { x: 0, z: 0 });
    const unit = hero(world);

    ai(world, field, unit, 1);
    expect(unit.z).toBeGreaterThan(-20);
  });

  it("沒有其他目標時沿兵線推進", () => {
    const world = makeWorld({ time: 5 });
    const unit = hero(world);
    ai(world, field, unit, 1);
    expect(unit.x).toBeGreaterThan(0);
  });

  it("近戰英雄進入射程就普攻", () => {
    const world = makeWorld({ time: 5 });
    const unit = hero(world, { range: 3.4 });
    const foe = spawn(world, "minion", 1, { x: 2, z: -20, hp: 300, maxHp: 300 });

    ai(world, field, unit, DT);
    expect(foe.hp).toBeLessThan(300);
  });

  it("遠程英雄直接發射，不走近戰的扇形判定", () => {
    const world = makeWorld({ time: 5 });
    const unit = hero(world, { hero: 1, range: 14 });
    spawn(world, "minion", 1, { x: 10, z: -20 });

    ai(world, field, unit, DT);
    expect(world.projectiles).toHaveLength(1);
  });

  it("對上英雄才交技能，補兵時留著", () => {
    const vsHero = makeWorld({ time: 30 });
    const a = spawn(vsHero, "hero", 0, { x: 0, z: -20, lane: 0, range: 3.4 });
    spawn(vsHero, "hero", 1, { x: 2, z: -20, hp: 900, maxHp: 900 });
    ai(vsHero, field, a, DT);
    expect((a.cd as number[])[0]).toBeGreaterThan(0);

    const vsMinion = makeWorld({ time: 30 });
    const b = spawn(vsMinion, "hero", 0, { x: 0, z: -20, lane: 0, range: 3.4 });
    spawn(vsMinion, "minion", 1, { x: 2, z: -20, hp: 300, maxHp: 300 });
    ai(vsMinion, field, b, DT);
    expect((b.cd as number[])[0]).toBe(0);
  });

  it("遠程英雄被貼臉時往後退", () => {
    const world = makeWorld({ time: 5 });
    const unit = hero(world, { hero: 1, range: 14, attack: 1 });
    spawn(world, "minion", 1, { x: 3, z: -20 });

    ai(world, field, unit, 1);
    expect(unit.x).toBeLessThan(0);
  });
});

describe("小兵", () => {
  it("沒有目標時推線", () => {
    const world = makeWorld();
    const unit = spawn(world, "minion", 0, { x: -30, z: -20, lane: 0 });
    ai(world, field, unit, 1);
    expect(unit.x).toBeGreaterThan(-30);
  });

  it("紅方小兵往相反方向推", () => {
    const world = makeWorld();
    const unit = spawn(world, "minion", 1, { x: 30, z: -20, lane: 0 });
    ai(world, field, unit, 1);
    expect(unit.x).toBeLessThan(30);
  });

  it("進入射程就停下來打", () => {
    const world = makeWorld();
    const unit = spawn(world, "minion", 0, { x: 0, z: -20, lane: 0 });
    const foe = spawn(world, "minion", 1, { x: 2, z: -20, hp: 300, maxHp: 300 });

    ai(world, field, unit, DT);
    expect(foe.hp).toBeLessThan(300);
    expect(unit.x).toBe(0);
  });
});

describe("攻城巨獸", () => {
  it("只打自己那一路的塔", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", 0, { x: 0, z: -20, lane: 0 });
    const ownLane = spawn(world, "tower", 1, { x: 3, z: -20, lane: 0, hp: 3600, maxHp: 3600 });
    spawn(world, "tower", 1, { x: 1, z: 20, lane: 1, hp: 3600, maxHp: 3600 });

    ai(world, field, boss, DT);
    expect(ownLane.hp).toBeLessThan(3600);
  });

  it("有英雄護送時撞擊威力大幅提升", () => {
    const alone = makeWorld();
    const a = spawn(alone, "boss", 0, { x: 0, z: -20, lane: 0 });
    const t1 = spawn(alone, "tower", 1, { x: 3, z: -20, lane: 0, hp: 3600, maxHp: 3600 });
    ai(alone, field, a, DT);

    const escorted = makeWorld();
    const b = spawn(escorted, "boss", 0, { x: 0, z: -20, lane: 0 });
    const t2 = spawn(escorted, "tower", 1, { x: 3, z: -20, lane: 0, hp: 3600, maxHp: 3600 });
    spawn(escorted, "hero", 0, { x: 2, z: -20 });
    ai(escorted, field, b, DT);

    expect(3600 - (t2.hp as number)).toBeGreaterThan(3600 - (t1.hp as number));
  });

  it("沒有可攻擊的建築時原地不動", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", 0, { x: 0, z: -20, lane: 0 });
    ai(world, field, boss, 1);
    expect(boss.x).toBe(0);
    expect(boss.moving).toBe(false);
  });

  it("撞擊會發出提示光環與聲音", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", 0, { x: 0, z: -20, lane: 0 });
    spawn(world, "tower", 1, { x: 3, z: -20, lane: 0, hp: 3600, maxHp: 3600 });

    ai(world, field, boss, DT);
    const types = typesOf(drained(world));
    expect(types).toContain("ring");
    expect(types).toContain("sound");
  });
});
