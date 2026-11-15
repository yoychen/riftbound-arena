/**
 * 戰鬥特效：近戰刀光、投射物的造型、命中火花、技能範圍與它們的點綴。
 *
 * 模擬層只送出事件（slash、burst）或描述狀態（投射物、區域），這裡決定長什麼樣子。
 * 數量多的東西（投射物、火花）共用幾何與材質；需要個別淡出的才各自持有材質，
 * 結束時釋放。
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { scene } from "./renderer.js";
import type { Projectile, Zone, ZoneFx } from "../core/world.js";

// ── 共用的工具 ─────────────────────────────────────────────

/** 疊加發光的材質：越疊越亮，適合刀光、火花、拖尾。 */
function glow(color: number, opacity = 1, vertexColors = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors,
  });
}

/** 平躺在地上、開口朝 +Z 的弧形。thetaLength 是弧的角度。 */
function flatArc(inner: number, outer: number, thetaLength: number, segments = 20): THREE.BufferGeometry {
  return new THREE.RingGeometry(inner, outer, segments, 1, -Math.PI / 2 - thetaLength / 2, thetaLength).rotateX(
    -Math.PI / 2,
  );
}

/**
 * 沿 -Z 往後拖的漸層條帶（前端不透明、尾端透明），用頂點的 alpha 做漸層。
 * 加在投射物上當拖尾。
 */
function trailGeometry(width: number, length: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(width, length, 1, 4).rotateX(-Math.PI / 2).translate(0, 0, -length / 2);
  const pos = g.getAttribute("position");
  const colors = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const t = -pos.getZ(i) / length; // 0 在前端，1 在尾端
    colors.set([1, 1, 1, (1 - t) ** 1.5], i * 4);
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 4));
  return g;
}

const easeOut = (t: number) => 1 - (1 - t) ** 3;

// ── 短命的特效 ─────────────────────────────────────────────

interface Transient {
  obj: THREE.Object3D;
  age: number;
  life: number;
  /** k 是 0..1 的進度。 */
  update(k: number, dt: number): void;
  /** 結束時要釋放的資源（共用的幾何不放這裡）。 */
  owned: { dispose(): void }[];
}
let transients: Transient[] = [];

function spawn(obj: THREE.Object3D, life: number, update: Transient["update"], owned: Transient["owned"] = []) {
  scene.add(obj);
  const fx = { obj, age: 0, life, update, owned };
  fx.update(0, 0);
  transients.push(fx);
}

/** 推進所有短命特效；animate 為假時凍結（暫停畫面）但仍保留。 */
export function stepFx(dt: number, animate: boolean) {
  if (!animate) return;
  for (const fx of transients) {
    fx.age += dt;
    fx.update(Math.min(1, fx.age / fx.life), dt);
  }
  transients = transients.filter((fx) => {
    if (fx.age < fx.life) return true;
    scene.remove(fx.obj);
    for (const r of fx.owned) r.dispose();
    return false;
  });
}

/** 換局時清掉還在場上的短命特效。 */
export function clearFx() {
  for (const fx of transients) {
    scene.remove(fx.obj);
    for (const r of fx.owned) r.dispose();
  }
  transients = [];
}

// ── 近戰刀光 ───────────────────────────────────────────────

const SLASH_ARC = 2.3;
const slashGeometry = flatArc(0.5, 1, SLASH_ARC, 24);
const slashCore = flatArc(0.86, 1, SLASH_ARC * 0.9, 24);

/**
 * 近戰揮砍：一道從右往左掃過面前的弧光。angle 是面向（atan2(dx, dz)），
 * r 是攻擊距離，y 是揮砍的高度（英雄比小兵高）。
 */
export function playSlash(x: number, z: number, angle: number, r: number, color: number, y = 0.9) {
  const group = new THREE.Group();
  const soft = glow(color, 0.55);
  const edge = glow(0xffffff, 0.9);
  group.add(new THREE.Mesh(slashGeometry, soft), new THREE.Mesh(slashCore, edge));
  group.position.set(x, y, z);
  group.scale.setScalar(r);
  spawn(
    group,
    0.2,
    (k) => {
      const e = easeOut(k);
      // 從右側掃到左側，最後略為放大、淡出
      group.rotation.y = angle + 0.85 - 1.7 * e;
      group.scale.setScalar(r * (0.85 + 0.2 * e));
      soft.opacity = 0.55 * (1 - k) ** 1.4;
      edge.opacity = 0.9 * (1 - k) ** 2;
    },
    [soft, edge],
  );
}

// ── 命中火花 ───────────────────────────────────────────────

/** 放射狀漸層的圓點貼圖，用在閃光上。 */
const flashTexture = (() => {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
})();
const sparkGeometry = new THREE.BoxGeometry(0.05, 0.05, 0.5).translate(0, 0, 0.25);
const sparkMaterials = new Map<number, THREE.MeshBasicMaterial>();
const sparkMaterial = (color: number) => {
  if (!sparkMaterials.has(color)) sparkMaterials.set(color, glow(color, 0.9));
  return sparkMaterials.get(color)!;
};

/** 命中：一個閃光，加上幾道往外噴的火花。 */
export function playHit(x: number, z: number, color: number, count = 7, y = 1.0) {
  const flashMaterial = new THREE.SpriteMaterial({
    map: flashTexture,
    color,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const flash = new THREE.Sprite(flashMaterial);
  flash.position.set(x, y, z);
  spawn(
    flash,
    0.16,
    (k) => {
      flash.scale.setScalar(0.6 + 1.4 * easeOut(k));
      flashMaterial.opacity = 1 - k;
    },
    [flashMaterial],
  );
  const material = sparkMaterial(color);
  for (let i = 0; i < count; i++) {
    const spark = new THREE.Mesh(sparkGeometry, material);
    const a = Math.random() * Math.PI * 2;
    const up = 0.2 + Math.random() * 0.8;
    const dir = new THREE.Vector3(Math.sin(a), up, Math.cos(a)).normalize();
    const speed = 5 + Math.random() * 5;
    spark.position.set(x, y, z);
    spark.lookAt(spark.position.clone().add(dir));
    spawn(spark, 0.18 + Math.random() * 0.12, (k, dt) => {
      spark.position.addScaledVector(dir, speed * dt);
      spark.scale.set(1, 1, Math.max(0.05, 1 - k));
    });
  }
}

// ── 投射物 ────────────────────────────────────────────────

type ProjectileKind = "arrow" | "orb" | "bolt" | "wave";

/** 依發射者決定投射物的樣子：射手是箭、法師是法球、塔是水晶彈、近戰的劍氣是飛行的弧。 */
function kindOf(p: Projectile): ProjectileKind {
  const s = p.source;
  if (s.type === "tower" || s.type === "core") return "bolt";
  if (s.type === "hero" && s.hero === 1) return "arrow";
  if (s.range < 6) return "wave";
  return "orb";
}

// 沿 +Z 擺放的共用幾何；投射物群組轉向飛行方向即可。
const arrowShaft = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 5).rotateX(Math.PI / 2);
const arrowHead = new THREE.ConeGeometry(0.08, 0.22, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const arrowFletch = new THREE.BoxGeometry(0.16, 0.01, 0.18).translate(0, 0, -0.34);
const arrowTrail = trailGeometry(0.18, 2.2).translate(0, 0, -0.3);
const orbCore = new THREE.IcosahedronGeometry(0.2, 1);
const orbHalo = new THREE.IcosahedronGeometry(0.34, 1);
const orbTrail = trailGeometry(0.34, 1.6);
const boltCore = new THREE.OctahedronGeometry(0.24);
const boltTrail = trailGeometry(0.2, 1.4);
const waveArc = flatArc(0.55, 1, 2.0, 18);

const materialCache = new Map<string, THREE.Material>();
function cached(key: string, make: () => THREE.Material) {
  if (!materialCache.has(key)) materialCache.set(key, make());
  return materialCache.get(key)!;
}

/** 建立投射物的模型。網格全部共用，disposeModel 會跳過它們。 */
export function projectileModel(p: Projectile): THREE.Object3D {
  const kind = kindOf(p);
  const group = new THREE.Group();
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const m = new THREE.Mesh(geometry, material);
    m.userData.shared = true;
    group.add(m);
    return m;
  };
  const c = p.color;
  if (kind === "arrow") {
    add(arrowShaft, cached("arrow-shaft", () => new THREE.MeshBasicMaterial({ color: 0xf0e0b3 })));
    add(arrowHead, cached(`arrow-head-${c}`, () => new THREE.MeshBasicMaterial({ color: c })));
    add(arrowFletch, cached("arrow-fletch", () => new THREE.MeshBasicMaterial({ color: 0xfff8e8, side: THREE.DoubleSide })));
    add(arrowTrail, cached(`trail-${c}`, () => glow(c, 0.85, true)));
  } else if (kind === "orb") {
    group.userData.spin = add(orbCore, cached(`orb-${c}`, () => new THREE.MeshBasicMaterial({ color: c })));
    add(orbHalo, cached(`halo-${c}`, () => glow(c, 0.35)));
    add(orbTrail, cached(`trail-${c}`, () => glow(c, 0.85, true)));
  } else if (kind === "bolt") {
    group.userData.spin = add(boltCore, cached(`bolt-${c}`, () => new THREE.MeshBasicMaterial({ color: c })));
    add(orbHalo, cached(`halo-${c}`, () => glow(c, 0.3)));
    add(boltTrail, cached(`trail-${c}`, () => glow(c, 0.8, true)));
  } else {
    add(waveArc, cached(`wave-${c}`, () => glow(c, 0.8)));
    group.scale.setScalar(1.3);
  }
  if (p.big) group.scale.multiplyScalar(1.6);
  group.rotation.y = Math.atan2(p.dx, p.dz);
  return group;
}

/** 每格更新投射物：位置、朝向、法球與水晶彈的自轉。 */
export function updateProjectileModel(model: THREE.Object3D, p: Projectile, dt: number) {
  model.position.set(p.x, 1.1, p.z);
  model.rotation.y = Math.atan2(p.dx, p.dz);
  const spin = model.userData.spin as THREE.Object3D | undefined;
  if (spin) {
    spin.rotation.z += dt * 9;
    spin.rotation.x += dt * 5;
  }
}

// ── 技能範圍 ───────────────────────────────────────────────

/**
 * 技能範圍的模型：
 * - 底盤：淡淡的圓。
 * - 邊緣：一圈亮線，生效時隨著每次結算脈動。
 * - 預告：生效前從中心往外填滿，看得出還有多久生效。
 * - 內圈：一圈緩慢旋轉的虛線刻紋。
 * - 千刃風暴另外有兩道繞著自己轉的刀光。
 */
export function zoneModel(z: Zone): THREE.Object3D {
  const group = new THREE.Group();
  group.position.set(z.x, 0.12, z.z);
  const flat = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const m = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), material);
    m.renderOrder = 1;
    group.add(m);
    return m;
  };
  const basic = (opacity: number) =>
    new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
  const parts: ZoneParts = {
    base: flat(new THREE.CircleGeometry(z.r, 48), basic(0.2)),
    fill: flat(new THREE.CircleGeometry(z.r, 48), basic(0.3)),
    edge: flat(new THREE.RingGeometry(z.r * 0.95, z.r, 64), glow(z.color, 0.9)),
    runes: flat(
      mergeGeometries(
        Array.from({ length: 10 }, (_, i) => new THREE.RingGeometry(z.r * 0.66, z.r * 0.71, 6, 1, (i / 10) * Math.PI * 2, 0.36)),
      ),
      glow(z.color, 0.5),
    ),
    blades: null,
  };
  parts.runes.position.y = 0.01;
  parts.edge.position.y = 0.02;
  if (z.fx === "storm") {
    const blades = new THREE.Group();
    for (const a of [0, Math.PI]) {
      const blade = new THREE.Mesh(flatArc(z.r * 0.35, z.r * 0.92, 1.1, 14), glow(0xffffff, 0.45));
      blade.rotation.y = a;
      blades.add(blade);
    }
    blades.position.y = 0.6;
    group.add(blades);
    parts.blades = blades;
  }
  group.userData.zone = parts;
  return group;
}

/** 每格更新技能範圍，並依種類產生點綴（落雷、流星、火星）。 */
export function updateZoneModel(model: THREE.Object3D, z: Zone, dt: number, animate: boolean) {
  const parts = model.userData.zone as ZoneParts;
  const elapsed = z.max - z.life;
  const charge = z.delay > 0 ? Math.min(1, elapsed / z.delay) : 1;
  const active = charge >= 1;
  const material = (m: THREE.Mesh) => m.material as THREE.MeshBasicMaterial;
  // 快結束時整個淡出
  const fade = Math.min(1, z.life / 0.3);
  // 預告：從中心往外填滿；生效後收起
  parts.fill.visible = !active;
  parts.fill.scale.setScalar(Math.max(0.001, charge));
  material(parts.fill).opacity = (0.22 + 0.16 * charge) * fade;
  // 每次結算時邊緣亮一下（tick 剛重設為 0.65 時最亮）
  const pulse = active ? Math.max(0, (z.tick - 0.45) / 0.2) : 0;
  material(parts.edge).opacity = (active ? 0.55 + 0.45 * pulse : 0.35 + 0.5 * charge) * fade;
  material(parts.base).opacity = (active ? 0.22 + 0.14 * pulse : 0.14) * fade;
  material(parts.runes).opacity = 0.5 * fade;
  if (!animate) return;
  parts.runes.rotation.y += dt * 0.6;
  if (parts.blades) parts.blades.rotation.y -= dt * 9;
  if (!active) return;
  accent(z, dt);
}

/** zoneModel 存在 userData 上的部位。 */
interface ZoneParts {
  base: THREE.Mesh;
  fill: THREE.Mesh;
  edge: THREE.Mesh;
  runes: THREE.Mesh;
  blades: THREE.Object3D | null;
}

/** 每個區域距離下一個點綴還有幾秒。 */
const accentTimers = new WeakMap<Zone, number>();

function randomPointIn(z: Zone) {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * z.r * 0.9;
  return { x: z.x + Math.sin(a) * r, z: z.z + Math.cos(a) * r };
}

const ACCENT_INTERVAL: Partial<Record<ZoneFx, number>> = { thunder: 0.16, meteor: 0.22, flame: 0.05 };

function accent(z: Zone, dt: number) {
  const interval = z.fx && ACCENT_INTERVAL[z.fx];
  if (!interval) return;
  let t = (accentTimers.get(z) ?? 0) - dt;
  while (t <= 0) {
    t += interval;
    const p = randomPointIn(z);
    if (z.fx === "thunder") playBolt(p.x, p.z, z.color);
    else if (z.fx === "meteor") playMeteor(p.x, p.z, z.color);
    else if (z.fx === "flame") playEmber(p.x, p.z, z.color);
  }
  accentTimers.set(z, t);
}

/** 落雷：從天上劈下來的鋸齒光帶，面向鏡頭（鏡頭在 +Z 上方）。 */
function playBolt(x: number, z: number, color: number) {
  const points: THREE.Vector2[] = [];
  const top = 7;
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const y = top * (1 - i / steps);
    points.push(new THREE.Vector2(i === 0 || i === steps ? 0 : (Math.random() - 0.5) * 0.9, y));
  }
  const positions: number[] = [];
  const w = 0.09;
  for (let i = 0; i < steps; i++) {
    const a = points[i],
      b = points[i + 1];
    positions.push(a.x - w, a.y, 0, a.x + w, a.y, 0, b.x + w, b.y, 0, a.x - w, a.y, 0, b.x + w, b.y, 0, b.x - w, b.y, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = glow(0xffffff, 1);
  const outer = glow(color, 0.6);
  const bolt = new THREE.Group();
  bolt.add(new THREE.Mesh(geometry, material));
  const wide = new THREE.Mesh(geometry, outer);
  wide.scale.set(3, 1, 1);
  bolt.add(wide);
  bolt.position.set(x, 0, z);
  spawn(
    bolt,
    0.14,
    (k) => {
      material.opacity = 1 - k;
      outer.opacity = 0.6 * (1 - k);
    },
    [geometry, material, outer],
  );
  playHit(x, z, color, 4, 0.2);
}

const meteorGeometry = new THREE.CylinderGeometry(0.12, 0.34, 3, 6).translate(0, 1.5, 0);
const meteorHead = new THREE.IcosahedronGeometry(0.36, 0);

/** 流星：從右上方斜斜墜落的光束，落地時炸開。 */
function playMeteor(x: number, z: number, color: number) {
  const material = glow(color, 0.9);
  const streak = new THREE.Group();
  streak.add(new THREE.Mesh(meteorGeometry, material), new THREE.Mesh(meteorHead, sparkMaterial(0xffffff)));
  const from = new THREE.Vector3(x + 3, 9, z - 2);
  const to = new THREE.Vector3(x, 0.1, z);
  // 光束的幾何沿 +Y 從原點往上長；轉到指向來的方向，尾巴就拖在後面。
  streak.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), from.clone().sub(to).normalize());
  let landed = false;
  spawn(
    streak,
    0.22,
    (k) => {
      streak.position.lerpVectors(from, to, k);
      if (k >= 1 && !landed) {
        landed = true;
        playHit(x, z, color, 5, 0.2);
      }
    },
    [material],
  );
}

const emberGeometry = new THREE.OctahedronGeometry(0.13);
const emberMaterials = new Map<number, THREE.MeshBasicMaterial>();

/** 火星：從地面往上飄的小光點。 */
function playEmber(x: number, z: number, color: number) {
  if (!emberMaterials.has(color)) emberMaterials.set(color, glow(color, 0.9));
  const ember = new THREE.Mesh(emberGeometry, emberMaterials.get(color)!);
  ember.position.set(x, 0.1, z);
  const drift = (Math.random() - 0.5) * 0.8;
  spawn(ember, 0.5 + Math.random() * 0.3, (k, dt) => {
    ember.position.y += dt * 2.6;
    ember.position.x += dt * drift;
    ember.scale.setScalar(Math.max(0.05, 1 - k));
  });
}
