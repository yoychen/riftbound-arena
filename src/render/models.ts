/**
 * 單位與區域的 3D 模型。
 *
 * 模擬層從不讀取這裡產生的任何東西 —— 模型由 sync 依實體資料掛上去，
 * 是單向的。
 */
import * as THREE from "three";
import { HEROES } from "../data/heroes.js";
import { teamColors } from "./terrain.js";
import { box, cyl, mesh, scene, sphere } from "./renderer.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { minionTeamMaterials, riggedTemplate, SkeletalAnimator } from "./skeletal.js";
import { createStructure } from "./structures.js";

/** 中立單位（尚未被收服的巨獸）的代表色。 */
const NEUTRAL_COLOR = 0xcf7446;

const worldEntities = new THREE.Group();
scene.add(worldEntities);

/**
 * 推進單位的骨架動作。回傳 false 表示這個模型沒有動作（程式拼出來的模型），
 * 呼叫端就沿用原本「移動時整隻上下跳」的表現。
 */
export function animateUnit(
  model: THREE.Object3D,
  unit: { moving: boolean; swing: number; x: number; z: number; facing: number },
  dt: number,
): boolean {
  const animator = model.userData.animator as SkeletalAnimator | undefined;
  animator?.update(unit.moving, unit.swing, dt, unit.x, unit.z, unit.facing);
  return !!animator;
}

function unitModel(type: string, team: number, hero = 0): THREE.Group {
  const root = new THREE.Group();
  const c = team < 0 ? NEUTRAL_COLOR : teamColors[team];
  const rigged = riggedTemplate(type, hero);
  // Blender 做的防禦塔與核心（art/build_structures.py），水晶是隊伍色。
  const structure = type === "tower" || type === "core" ? createStructure(type, c) : null;
  if (structure) {
    root.add(structure);
    root.userData.crystal = structure.userData.crystal;
  } else if (rigged) {
    // 有骨架的模型要用 SkeletonUtils 複製，骨頭才會接到新的那一份。
    const body = cloneSkinned(rigged.model);
    if (type === "minion")
      body.traverse((o) => {
        if (o.name === "Team") (o as THREE.Mesh).material = minionTeamMaterials[team] ?? minionTeamMaterials[0];
      });
    root.add(body);
    if (rigged.clips.length) root.userData.animator = new SkeletalAnimator(body, rigged.clips);
  } else if (type === "hero") {
    const h = HEROES[hero],
      bulky = hero === 3;
    cyl(
      bulky ? 0.78 : 0.48,
      bulky ? 0.85 : 0.6,
      1.2,
      h.color,
      0,
      1.1,
      0,
      root,
      6,
    );
    sphere(0.43, 0xe4c9a0, 0, 2.02, 0, root, 1);
    box(0.67, 0.18, 0.68, hero === 2 ? 0x7d65ab : 0x324e4c, 0, 2.25, 0, root);
    box(0.28, 0.62, 0.34, 0x294343, -0.29, 0.35, 0, root);
    box(0.28, 0.62, 0.34, 0x294343, 0.29, 0.35, 0, root);
    const cape = mesh(
      new THREE.ConeGeometry(0.7, 1.4, 4),
      h.color,
      0,
      1.25,
      -0.36,
      root,
    );
    cape.rotation.x = -0.25;
    if (hero === 0) {
      box(0.15, 1.65, 0.16, 0xdbede3, 0.8, 1.4, 0.48, root);
      box(0.7, 0.13, 0.2, 0xcbb477, 0.8, 0.8, 0.48, root);
    }
    if (hero === 1) {
      const bow = mesh(
        new THREE.TorusGeometry(0.7, 0.07, 4, 12, Math.PI),
        0xe6bc66,
        0.65,
        1.3,
        0.2,
        root,
      );
      bow.rotation.z = -Math.PI / 2;
      box(0.04, 1.4, 0.04, 0xf0e0b3, 0.65, 1.3, 0.2, root);
    }
    if (hero === 2) {
      cyl(0.06, 0.07, 2.1, 0xc5b58d, 0.75, 1.25, 0.15, root);
      sphere(0.32, 0xbea0fc, 0.75, 2.35, 0.15, root);
      cyl(0, 0.64, 1.1, 0x7f68aa, 0, 2.7, 0, root, 6);
    }
    if (hero === 3) {
      box(0.9, 1.1, 0.25, 0xc8ac70, -0.95, 1.1, 0.35, root);
      box(0.7, 0.6, 0.6, 0x859890, 1.05, 1.65, 0.3, root);
      cyl(0.09, 0.09, 1.2, 0x6e6655, 1.05, 1, 0.3, root);
    }
  } else if (type === "minion") {
    cyl(0.35, 0.42, 0.7, team === 0 ? 0x428f99 : 0xa95f68, 0, 0.6, 0, root, 5);
    sphere(0.28, 0xc5c6a3, 0, 1.16, 0, root);
    box(0.1, 0.8, 0.12, 0xb9cfc5, 0.5, 0.7, 0.2, root);
  } else if (type === "tower") {
    cyl(1.5, 1.8, 0.5, 0x65796f, 0, 0.25, 0, root);
    cyl(0.8, 1.2, 3.1, 0x879a8b, 0, 1.9, 0, root);
    cyl(1.2, 0.8, 0.6, 0xb9c5aa, 0, 3.4, 0, root);
    const crystal = mesh(
      new THREE.OctahedronGeometry(0.65),
      c,
      0,
      4.3,
      0,
      root,
      0.8,
    );
    root.userData.crystal = crystal;
  } else if (type === "core") {
    cyl(2.2, 2.7, 1, 0x627970, 0, 0.5, 0, root);
    for (let i = 0; i < 5; i++) {
      let a = (i / 5) * Math.PI * 2;
      box(
        0.38,
        2.5,
        0.4,
        0x9cab94,
        Math.sin(a) * 1.8,
        1.3,
        Math.cos(a) * 1.8,
        root,
      );
    }
    const crystal = mesh(
      new THREE.OctahedronGeometry(1.7),
      c,
      0,
      3.1,
      0,
      root,
      0.75,
    );
    crystal.scale.y = 1.4;
    root.userData.crystal = crystal;
  } else {
    const shell = sphere(2.45, 0x655548, 0, 1.8, 0, root, 1);
    shell.scale.set(1, 0.7, 1.2);
    for (let i = 0; i < 7; i++) {
      let a = (i / 7) * Math.PI * 2;
      mesh(
        new THREE.ConeGeometry(0.48, 1.2, 5),
        0xffa455,
        Math.sin(a) * 1.6,
        2.8,
        Math.cos(a) * 1.8,
        root,
        0.6,
      );
    }
    sphere(0.85, 0x977155, 0, 1.25, 2.7, root);
    sphere(0.14, 0xffcc74, -0.4, 1.5, 3.35, root);
    sphere(0.14, 0xffcc74, 0.4, 1.5, 3.35, root);
    for (let a of [-1, 1])
      for (let b of [-1, 1])
        cyl(0.5, 0.6, 0.8, 0x7f6b52, a * 1.7, 0.55, b * 1.7, root);
  }
  const ring = mesh(
    new THREE.RingGeometry(
      type === "hero"
        ? 0.85
        : type === "minion"
          ? 0.45
          : type === "boss"
            ? 2.6
            : 1.5,
      type === "hero"
        ? 1
        : type === "minion"
          ? 0.53
          : type === "boss"
            ? 2.8
            : 1.65,
      32,
    ),
    c,
    0,
    0.06,
    0,
    root,
    0.3,
  );
  ring.rotation.x = -Math.PI / 2;
  (ring.material as THREE.Material).side = THREE.DoubleSide;
  if (type === "boss") {
    // 巨獸被收服後會換隊，腳下的光環要跟著換色。共用材質不能改色，
    // 所以給它自己的一份，釋放模型時一併釋放。
    ring.material = (ring.material as THREE.MeshStandardMaterial).clone();
    ring.userData.ownMaterial = true;
    root.userData.ring = ring;
    root.userData.ringTeam = team;
  }
  return root;
}

/** 巨獸換隊時，把腳下光環改成新隊伍的顏色。 */
export function syncRingTeam(model: THREE.Object3D, team: number): void {
  const ring = model.userData.ring as THREE.Mesh | undefined;
  if (!ring || model.userData.ringTeam === team) return;
  model.userData.ringTeam = team;
  const color = team < 0 ? NEUTRAL_COLOR : teamColors[team];
  const material = ring.material as THREE.MeshStandardMaterial;
  material.color.setHex(color);
  material.emissive.setHex(color);
}
/**
 * 建立單位並掛上模型。
 *
 * 數值與實體結構由核心層決定，這裡只負責補上 THREE 的部分 ——
 * 模擬層從不讀取 `model`。
 */

/**
 * 釋放一個模型佔用的 GPU 資源。
 *
 * 材質大多來自 `mat()` 的共用快取，釋放掉會讓其他還在場上的單位變成黑色，
 * 所以預設只釋放幾何。只有自己 new 出來的材質（區域圓盤、擴散光環）才傳
 * `disposeMaterial`。
 */
export function disposeModel(model: unknown, disposeMaterial = false) {
  if (!model) return;
  (model as THREE.Object3D).traverse((o) => {
    // 每份複製各有自己的骨架，骨架的骨頭貼圖要跟著釋放。
    (o as Partial<THREE.SkinnedMesh>).skeleton?.dispose();
    if (o.userData.shared) return; // 共用的 Blender 模型，下一場還要用
    const mesh = o as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();
    if (disposeMaterial || o.userData.ownMaterial) (mesh.material as THREE.Material | undefined)?.dispose();
  });
}

/**
 * 取出掛在實體上的模型。
 *
 * 核心層把 `model` 存成 `unknown` —— 它不該認識 THREE，也從不讀它。
 * 只有呈現層知道真正的型別，所以轉型集中在這一個地方。
 */
export function modelOf(carrier: { model?: unknown }): THREE.Object3D {
  return carrier.model as THREE.Object3D;
}

export { worldEntities, unitModel };
