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
 * 進化與裝備點亮的旗標。
 *
 * 戰鬥邏輯查這些旗標決定要不要套用額外效果。全部是選擇性的 ——
 * 沒點到的進化就是 undefined。
 */
export interface Mods {
  /** 造成傷害的 12% 轉為自身生命。 */
  leech?: boolean;
  /** 技能冷卻縮短 22%。 */
  haste?: boolean;
  /** 攻擊附帶緩速。 */
  frost?: boolean;
  /** 突進在原地留下燃燒區域。 */
  trail?: boolean;
  /** 對殘血目標追加傷害。 */
  execute?: boolean;
  /** 傷害加成，可累加（進化 +0.2、裝備 +0.12）。 */
  power?: number;
  /** 投射物命中後彈向下一個敵人。 */
  bounce?: boolean;
  /** 近戰普攻額外射出劍氣。 */
  blade?: boolean;
  /** 遠程普攻變成三連發。 */
  split?: boolean;
  /** 技能追加側翼彈道，或讓法球變穿透。 */
  fan?: boolean;
  /** 翻滾後加快攻速並補射。 */
  roll?: boolean;
  /** 技能打中緩速目標時傷害提升。 */
  combo?: boolean;
  /** 攻擊累積印記，四層引爆。 */
  mark?: boolean;
  /** 格擋期間反傷。 */
  reflect?: boolean;
  /** 護盾技的護盾量提升。 */
  fortress?: boolean;
  /** 護盾破裂時炸傷周圍。 */
  thorns?: boolean;
  /** 大招範圍大幅擴張。 */
  mega?: boolean;
}

/** 場上的單位。 */
export interface Entity extends Point {
  id: number;
  type: "hero" | "minion" | "tower" | "core" | "boss";
  /** 0 藍方、1 紅方、-1 中立。 */
  team: number;
  /** 索引到 HEROES。非英雄一律是 0，不具意義。 */
  hero: number;
  /** 所屬兵線，0 或 1。 */
  lane: number;

  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;

  /** 距離下次可以普攻還有幾秒。 */
  attack: number;
  /** Q / E / R / 閃避的剩餘冷卻。 */
  cd: number[];
  /** 面向角度（弧度）。模型旋轉由呈現層的 syncModels 推導。 */
  facing: number;
  /** 陣亡後距離復活還有幾秒。 */
  dead: number;
  /** 沿兵線的進度，0 是藍方基地、1 是紅方基地。 */
  progress: number;
  level: number;
  xp: number;

  shield: number;
  /** 格擋剩餘秒數，期間傷害降到 18%。 */
  guard: number;
  slow: number;
  stun: number;
  /** 攻速提升的剩餘秒數。 */
  boost: number;
  mods: Mods;

  /** 無敵剩餘秒數。閃避與復活保護期間大於 0。 */
  invuln: number;
  /** 受擊閃白的剩餘秒數。 */
  hit: number;
  /** 揮擊動作的剩餘秒數。 */
  swing: number;
  /** 累積的印記層數，四層引爆。 */
  mark: number;
  /** 這一幀有沒有在移動，決定走路的上下擺動。 */
  moving: boolean;

  /** 只有玩家操控的英雄有這個。 */
  isPlayer?: boolean;
  /** 防禦塔記下的仇恨目標 id。尚未被激怒時不存在。 */
  aggro?: number;
  /** 上一幀是否還有護盾，thorns 用來偵測護盾破裂的瞬間。 */
  hadShield?: boolean;

  /**
   * 呈現層掛上的 THREE.Object3D。
   *
   * 刻意留成 unknown：核心層不該認識 THREE，更不該讀它。
   */
  model?: unknown;
}

/** 飛行中的投射物。 */
export interface Projectile extends Point {
  /** 單位方向向量。 */
  dx: number;
  dz: number;
  /** 每秒飛行距離。 */
  speed: number;
  /** 剩餘射程，歸零就消失。 */
  left: number;
  source: Entity;
  damage: number;
  /** 穿透：命中後繼續飛行。 */
  pierce: boolean;
  /** 已經打到過的目標 id，避免穿透彈重複計算。 */
  hit: Set<number>;
  /** 較大的彈體，影響碰撞半徑與外觀。 */
  big: boolean;
  radius: number;
  color: number;
  /** 命中後施加的緩速秒數。 */
  slow?: number;
  /** 是否計為技能傷害。 */
  skill?: boolean;
  /** 命中後彈向下一個敵人，只會彈一次。 */
  bounce: boolean;
  /** 呈現層掛上的模型，見 Entity.model。 */
  model?: unknown;
}

/** 地面上的持續傷害區域。 */
export interface Zone extends Point {
  r: number;
  /** 剩餘存在時間。 */
  life: number;
  /** 初始存在時間，用來換算進度。 */
  max: number;
  source: Entity;
  /** 每次結算的傷害。 */
  dmg: number;
  /** 第一次結算前的預告時間，讓對手有機會走開。 */
  delay: number;
  /** 距離下次結算還有幾秒。 */
  tick: number;
  color: number;
  slow: number;
  stun: number;
  model?: unknown;
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

  /**
   * 玩家的瞄準位置，由輸入層每幀更新。
   * 技能落點與面向都以它為準。
   */
  aim: Point;
  /**
   * 是否自動瞄準最近的敵人。觸控裝置或滑鼠還沒動過時為真 ——
   * 此時沒有有意義的游標位置可用。
   */
  autoAim: boolean;
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
    aim: { x: 0, z: 0 },
    autoAim: false,
  };
}
