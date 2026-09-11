/**
 * 一場戰鬥的完整狀態。
 *
 * 這些欄位原本是 game.js 的模組層 `let`，任何函式都能直接讀寫。收進一個容器
 * 之後，戰鬥邏輯就能寫成 `damage(world, target, n, source)` 這種形式搬進核心層，
 * 測試也能各自建立獨立的戰局互不干擾。
 *
 * 只收「模擬」狀態。特效、傷害數字、鏡頭、音訊、UI 狀態機都不在這裡——
 * 它們是呈現層的東西，模擬不該知道它們存在。
 */

import { createEventQueue, type EventQueue } from "./events.js";
import type { Point } from "./vec.js";

/**
 * 場上的單位。
 *
 * 型別刻意保持寬鬆：game.js 尚未轉成 TypeScript，過早收緊只會製造摩擦。
 * 階段 8 逐檔轉換時再補完。
 */
export interface Entity extends Point {
  id: number;
  type: "hero" | "minion" | "tower" | "core" | "boss";
  /** 0 藍方、1 紅方、-1 中立。 */
  team: number;
  hp: number;
  maxHp: number;
  /** 面向角度（弧度）。模型旋轉由 syncModels 推導。 */
  facing: number;
  isPlayer?: boolean;
  [key: string]: unknown;
}

export interface Projectile extends Point {
  [key: string]: unknown;
}

export interface Zone extends Point {
  [key: string]: unknown;
}

/** 中立巨獸的收服進度。 */
export interface Capture {
  team: number;
  /** 已累積的秒數，滿 5 秒完成。 */
  value: number;
}

/** 玩家按 G 或點小地圖發出的集合指令。 */
export interface Ping extends Point {
  /** 指令失效的戰鬥時間。 */
  until: number;
}

export interface World {
  /**
   * 模擬產生的副作用。特效、音效、提示都描述成事件推進這裡，
   * 由呈現層每幀取用 —— 是模擬的「輸出」，不是呈現層狀態。
   */
  events: EventQueue;

  entities: Entity[];
  projectiles: Projectile[];
  zones: Zone[];
  /** 玩家操控的英雄，同時也在 entities 裡。 */
  player: Entity | null;
  /** 下一個實體 id，跨局遞增不重置。 */
  nextId: number;

  /** 戰鬥經過的秒數。 */
  time: number;
  /** 下一波小兵的生成時間。 */
  waveAt: number;
  /** 巨獸甦醒的時間。 */
  bossAt: number;
  boss: Entity | null;
  capture: Capture | null;
  /** 雙方的擊殺數，索引即隊伍編號。 */
  scores: [number, number];
  ping: Ping | null;

  gold: number;
  kills: number;
  deaths: number;
  /** 已完成的進化次數，共五次。 */
  evoIndex: number;
  rerolls: number;
  chosen: { id: string; name: string; icon: string; desc: string }[];
  shopBuys: number;

  /** 玩家點地移動待走的轉折點。 */
  movePath: Point[];
}

export function createWorld(): World {
  return {
    events: createEventQueue(),

    entities: [],
    projectiles: [],
    zones: [],
    player: null,
    nextId: 1,

    time: 0,
    waveAt: 0,
    bossAt: 180,
    boss: null,
    capture: null,
    scores: [0, 0],
    ping: null,

    gold: 0,
    kills: 0,
    deaths: 0,
    evoIndex: 0,
    rerolls: 2,
    chosen: [],
    shopBuys: 0,

    movePath: [],
  };
}
