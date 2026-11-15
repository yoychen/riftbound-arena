/**
 * 地面的擴散光環：技能預告、區域結算、集合指令這類提示。
 *
 * 模擬層只送出 `ring` 事件，生命週期完全由這裡保管 —— 特效持有 THREE 網格，
 * 所以它不能放進 world。刀光、火花、投射物等戰鬥特效在 fx.ts。
 */
import * as THREE from "three";
import { clamp } from "../core/vec.js";
import { scene } from "./renderer.js";

/** 擴散光環：自己持有幾何與材質，靠縮放與淡出演出。 */
interface RingEffect {
  model: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** 剩餘壽命（秒）。 */
  life: number;
  /** 初始壽命，用來換算進度。 */
  max: number;
}

let effects: RingEffect[] = [];

function playRing(x: number, z: number, r: number, color: number, life = 0.45) {
  const m = new THREE.Mesh(
    new THREE.RingGeometry(r * 0.88, r, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.18, z);
  scene.add(m);
  effects.push({ model: m, life, max: life });
}

function release(e: RingEffect) {
  scene.remove(e.model);
  e.model.geometry.dispose();
  e.model.material.dispose();
}

/** 依 dt 推進光環；`animate` 為假時凍結（暫停畫面）但仍保留。 */
export function stepEffects(dt: number, animate: boolean) {
  if (!animate) return;
  for (const e of effects) {
    e.life -= dt;
    e.model.scale.setScalar(1 + (1 - e.life / e.max) * 0.3);
    e.model.material.opacity = clamp((e.life / e.max) * 0.8, 0, 1);
  }
  effects = effects.filter((e) => {
    if (e.life > 0) return true;
    release(e);
    return false;
  });
}

/** 換局時把還在場上的光環清掉，連同它們的 GPU 資源。 */
export function clearEffects() {
  for (const e of effects) release(e);
  effects = [];
}

export { playRing };
