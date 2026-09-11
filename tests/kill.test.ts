import { describe, expect, it } from "vitest";
import { kill } from "../src/core/combat.js";
import { drained, makeWorld, spawn, typesOf } from "./fixtures.js";

describe("英雄陣亡", () => {
  it("擊殺者的隊伍得分", () => {
    const world = makeWorld();
    const killer = spawn(world, "hero", 0);
    const victim = spawn(world, "hero", 1);

    kill(world, victim, killer);
    expect(world.scores).toEqual([1, 0]);
  });

  it("沒有擊殺者時算在對手隊頭上", () => {
    const world = makeWorld();
    kill(world, spawn(world, "hero", 1), null);
    expect(world.scores).toEqual([1, 0]);
  });

  it("被中立巨獸擊殺也算對手隊得分", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", -1);
    kill(world, spawn(world, "hero", 0), boss);
    expect(world.scores).toEqual([0, 1]);
  });

  it("復活時間隨戰鬥時間拉長，並封頂在 16 秒", () => {
    const early = makeWorld();
    kill(early, spawn(early, "hero", 1), null);
    expect(early.entities[0].dead).toBe(7);

    const mid = makeWorld({ time: 300 });
    kill(mid, spawn(mid, "hero", 1), null);
    expect(mid.entities[0].dead).toBe(12);

    const late = makeWorld({ time: 1200 });
    kill(late, spawn(late, "hero", 1), null);
    expect(late.entities[0].dead).toBe(16);
  });

  it("玩家陣亡會清空移動路徑並通知呈現層", () => {
    const world = makeWorld();
    const player = spawn(world, "hero", 0, { isPlayer: true });
    world.player = player;
    world.movePath = [{ x: 5, z: 5 }];

    kill(world, player, spawn(world, "hero", 1));
    expect(world.deaths).toBe(1);
    expect(world.movePath).toEqual([]);
    expect(typesOf(drained(world))).toContain("playerDeath");
  });

  it("玩家擊殺英雄可得 110 金幣", () => {
    const world = makeWorld();
    const player = spawn(world, "hero", 0, { isPlayer: true });
    kill(world, spawn(world, "hero", 1), player);

    expect(world.kills).toBe(1);
    expect(world.gold).toBe(110);
  });

  it("隊友擊殺不計入玩家的擊殺數與金幣", () => {
    const world = makeWorld();
    kill(world, spawn(world, "hero", 1), spawn(world, "hero", 0));
    expect(world.kills).toBe(0);
    expect(world.gold).toBe(0);
  });
});

describe("小兵陣亡", () => {
  const setup = () => {
    const world = makeWorld();
    const player = spawn(world, "hero", 0, { isPlayer: true });
    world.player = player;
    return { world, player };
  };

  it("玩家補到刀拿 23 金幣，在旁邊只拿 15", () => {
    const a = setup();
    kill(a.world, spawn(a.world, "minion", 1), a.player);
    expect(a.world.gold).toBe(23);

    const b = setup();
    kill(b.world, spawn(b.world, "minion", 1), spawn(b.world, "hero", 0));
    expect(b.world.gold).toBe(15);
  });

  it("離太遠就分不到金幣與經驗", () => {
    const { world, player } = setup();
    kill(world, spawn(world, "minion", 1, { x: 40 }), player);
    expect(world.gold).toBe(0);
    expect(player.xp).toBe(0);
  });

  it("我方小兵陣亡不給玩家金幣", () => {
    const { world } = setup();
    kill(world, spawn(world, "minion", 0), null);
    expect(world.gold).toBe(0);
  });

  it("附近的敵方英雄都分到經驗，玩家不會拿兩份", () => {
    const { world, player } = setup();
    const ally = spawn(world, "hero", 0, { x: 3 });
    const enemyHero = spawn(world, "hero", 1, { x: 3 });

    kill(world, spawn(world, "minion", 1), player);
    expect(player.xp).toBe(25);
    expect(ally.xp).toBe(25);
    expect(enemyHero.xp).toBe(0);
  });
});

describe("建築與巨獸陣亡", () => {
  it("我方摧毀敵塔得 200 金幣，敵方摧毀我方塔則否", () => {
    const a = makeWorld();
    kill(a, spawn(a, "tower", 1), spawn(a, "hero", 0));
    expect(a.gold).toBe(200);

    const b = makeWorld();
    kill(b, spawn(b, "tower", 0), spawn(b, "hero", 1));
    expect(b.gold).toBe(0);
  });

  it("核心被摧毀就結束戰局，勝負依核心所屬隊伍", () => {
    const win = makeWorld();
    kill(win, spawn(win, "core", 1), spawn(win, "hero", 0));
    expect(drained(win)).toContainEqual({ type: "matchEnd", win: true });

    const lose = makeWorld();
    kill(lose, spawn(lose, "core", 0), spawn(lose, "hero", 1));
    expect(drained(lose)).toContainEqual({ type: "matchEnd", win: false });
  });

  it("中立巨獸倒下後進入收服階段，而非直接易主", () => {
    const world = makeWorld();
    const boss = spawn(world, "boss", -1);
    kill(world, boss, spawn(world, "hero", 0));

    expect(world.capture).toEqual({ team: 0, value: 0 });
    expect(world.boss).toBeNull();
  });

  it("已收服的巨獸倒下則排定下一次爭奪", () => {
    const world = makeWorld({ time: 200 });
    const boss = spawn(world, "boss", 0);
    world.boss = boss;

    kill(world, boss, spawn(world, "hero", 1));
    expect(world.boss).toBeNull();
    expect(world.bossAt).toBe(340);
    expect(world.capture).toBeNull();
  });
});

describe("陣亡的共通處理", () => {
  it("血量歸零並產生爆散特效", () => {
    const world = makeWorld();
    const victim = spawn(world, "minion", 1, { hp: 40 });
    kill(world, victim, null);

    expect(victim.hp).toBe(0);
    expect(typesOf(drained(world))).toContain("burst");
  });
});
