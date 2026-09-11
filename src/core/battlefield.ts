/**
 * 地形提供給模擬層的介面。
 *
 * 兵線是 THREE 的 CatmullRomCurve3、障礙物是擺樹時順手登記的碰撞圓，
 * 兩者都在建構場景時產生。模擬需要它們（走位、繞障礙、推兵線），但不該
 * 因此認識 THREE —— 所以由呈現層建好之後注入這個介面。
 *
 * `pointOnLane` 刻意不在核心層用取樣點自行內插：那會和原本的曲線取值產生
 * 微小差異，兵線走法就不再等價了。實作留在呈現層直接問曲線。
 */

import type { Navigation, Obstacle } from "./navigation.js";
import type { Point } from "./vec.js";

export interface Battlefield {
  /** 樹木等靜態碰撞圓。 */
  obstacles: readonly Obstacle[];
  navigation: Navigation;
  /** 兩隊基地座標，索引即隊伍編號。 */
  bases: readonly Point[];
  /** 可行走範圍的半寬與半長。 */
  bounds: { x: number; z: number };
  /** 兵線 lane 上進度 t（0 藍方端、1 紅方端）的世界座標。 */
  pointOnLane(lane: number, t: number): Point;
  /** 某個位置在兵線 lane 上最接近的進度。 */
  progressOn(lane: number, point: Point): number;
}
