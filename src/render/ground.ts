/**
 * 地面高度：地圖上凸起的平台（兩座基地、中央坑、河上的橋）。
 *
 * 平台的邊緣都是斜坡，單位沿著斜面走上去，不會一步跳上台階。這裡同時產生
 * 平台的幾何與高度資料，兩者出自同一組數字，畫出來的斜面和單位腳下的高度
 * 才對得上。terrain.ts 用這裡的函式蓋平台；單位的模型與頭上的血條照
 * groundHeight 墊高。
 *
 * 獨立成一個模組，是因為 terrain.ts 一匯入就會蓋整張地圖，標籤這類只想查
 * 高度的模組不該觸發它。只影響畫面：模擬層照樣把整張地圖當成平面。
 */
import * as THREE from "three";

interface Slope {
  /** 頂面高度。 */
  top: number;
  /** 斜坡腳的高度（底下那一層的頂面；直接放在地上就是 0）。 */
  base: number;
  /** 斜坡的水平寬度：從頂面邊緣往外多遠降到 base。 */
  slope: number;
}

interface Disc extends Slope {
  x: number;
  z: number;
  /** 頂面半徑。 */
  r: number;
}

interface Rect extends Slope {
  x: number;
  z: number;
  /** 頂面的半寬（自身的 x）與半長（自身的 z）。 */
  halfW: number;
  halfD: number;
  /** 繞 Y 軸轉的角度，和 three.js 的 rotation.y 相同。 */
  cos: number;
  sin: number;
}

const discs: Disc[] = [];
const rects: Rect[] = [];

/**
 * 圓形平台：頂面半徑 r，往外 slope 的距離內從 top 降到 base。回傳的幾何
 * 已經擺在世界座標的高度上，網格放在 (x, 0, z) 即可。
 */
export function discPlatform(
  x: number,
  z: number,
  r: number,
  shape: Slope,
  segments = 20,
) {
  discs.push({ x, z, r, ...shape });
  const height = shape.top - shape.base;
  const geometry = new THREE.CylinderGeometry(
    r,
    r + shape.slope,
    height,
    segments,
  );
  geometry.translate(0, shape.base + height / 2, 0);
  return geometry;
}

/**
 * 長方形平台（橋），四邊都是斜坡。angle 是繞 Y 軸的轉角（同 rotation.y），
 * 轉完之後自身的 z 軸（depth 方向）朝向 (sin angle, cos angle)。
 */
export function rectPlatform(
  x: number,
  z: number,
  width: number,
  depth: number,
  angle: number,
  shape: Slope,
) {
  const halfW = width / 2,
    halfD = depth / 2;
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  rects.push({ x, z, halfW, halfD, cos, sin, ...shape });
  const height = shape.top - shape.base;
  const geometry = new THREE.BoxGeometry(
    width + shape.slope * 2,
    height,
    depth + shape.slope * 2,
  );
  // 把頂面的四個角往內收成頂面大小，側面就成了斜坡。
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) {
      position.setX(i, Math.sign(position.getX(i)) * halfW);
      position.setZ(i, Math.sign(position.getZ(i)) * halfD);
    }
  }
  geometry.computeVertexNormals();
  geometry.rotateY(angle);
  geometry.translate(0, shape.base + height / 2, 0);
  return geometry;
}

/** 離頂面邊緣 outside 遠（在頂面上為負）時，這個平台的高度；不在平台上回傳 0。 */
function heightOn(p: Slope, outside: number) {
  if (outside <= 0) return p.top;
  if (outside >= p.slope) return 0;
  return p.top - ((p.top - p.base) * outside) / p.slope;
}

/**
 * 單位的模型要墊多高。核心與防禦塔的模型本來就是坐在平台裡的樣子設計的，
 * 維持放在 y = 0；會走動的單位才站到平台上。
 */
export function standingHeight(type: string, x: number, z: number) {
  return type === "core" || type === "tower" ? 0 : groundHeight(x, z);
}

/** (x, z) 處的地面高度；疊在一起的平台取最高的那個。 */
export function groundHeight(x: number, z: number) {
  let height = 0;
  for (const p of discs) {
    if (p.top <= height) continue;
    height = Math.max(height, heightOn(p, Math.hypot(x - p.x, z - p.z) - p.r));
  }
  for (const p of rects) {
    if (p.top <= height) continue;
    // 頂面收成長方形後，四個斜面在角落交會，高度由離得最遠的那一邊決定。
    // 換到平台自己的座標（rotation.y 的反轉）。
    const dx = x - p.x,
      dz = z - p.z;
    const across = dx * p.cos - dz * p.sin,
      along = dx * p.sin + dz * p.cos;
    const outside = Math.max(
      Math.abs(across) - p.halfW,
      Math.abs(along) - p.halfD,
    );
    height = Math.max(height, heightOn(p, outside));
  }
  return height;
}
