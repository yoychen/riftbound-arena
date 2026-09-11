/** 平面向量與數值工具。核心層共用，不依賴 THREE 或 DOM。 */

export interface Point {
  x: number;
  z: number;
}

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export const dist = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.z - b.z);

export const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

/**
 * 正規化為單位向量。零向量會原樣回傳，呼叫端因此不需要自己防除以零 ——
 * 這正是原本散落在 attack()/cast()/shoot() 裡 `Math.hypot(d.x, d.z) || 1` 的用意。
 */
export function normalize(v: Point): Point {
  const length = Math.hypot(v.x, v.z);
  return length ? { x: v.x / length, z: v.z / length } : { x: 0, z: 0 };
}

/** 把秒數格式化成 mm:ss。 */
export const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:` +
  `${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
