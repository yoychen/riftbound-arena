/**
 * 短命的視覺效果：擴散光環與粒子爆散。
 *
 * 模擬層只送出 `ring` 與 `burst` 事件，生命週期完全由這裡保管 ——
 * 特效持有 THREE 網格，所以它不能放進 world。
 */
import * as THREE from "three";
import { clamp } from "../core/vec.js";
import { mesh, scene, sphere } from "./renderer.js";
import { disposeModel } from "./models.js";
import { rand } from "../core/vec.js";

/** 網格的材質一律是單一個，不是 THREE 允許的陣列。 */
type SingleMaterialMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

interface EffectBase {
  model: SingleMaterialMesh;
  /** 剩餘壽命（秒）。 */
  life: number;
  /** 初始壽命，用來換算進度。 */
  max: number;
}

/** 擴散光環：自己持有材質，靠縮放與淡出演出。 */
interface RingEffect extends EffectBase {
  expand: true;
}

/** 爆散粒子：材質來自共用快取，受重力影響。 */
interface ParticleEffect extends EffectBase {
  expand?: false;
  vx: number;
  vy: number;
  vz: number;
}

/** `expand` 同時是形態的判別欄位，兩種效果的欄位因此不會混用。 */
type Effect = RingEffect | ParticleEffect;

let effects: Effect[] = [];

function playRing(
  x: number,
  z: number,
  r: number,
  color: number,
  life = 0.45,
) {
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
  effects.push({ model: m as SingleMaterialMesh, life, max: life, expand: true });
}
function playBurst(x: number, z: number, color: number, count = 10) {
  for (let i = 0; i < count; i++) {
    const m = sphere(0.12, color, x, 0.6, z, scene);
    effects.push({
      model: m as SingleMaterialMesh,
      life: rand(0.2, 0.55),
      max: 0.55,
      vx: rand(-7, 7),
      vz: rand(-7, 7),
      vy: rand(2, 7),
    });
  }
}

/** 依 dt 推進特效；`animate` 為假時凍結（暫停畫面）但仍保留。 */
export function stepEffects(dt: number, animate: boolean) {
  for (const e of effects) {
    if (animate) {
      e.life -= dt;
      if (e.expand) {
        const s = 1 + (1 - e.life / e.max) * 0.3;
        e.model.scale.setScalar(s);
        e.model.material.opacity = clamp((e.life / e.max) * 0.8, 0, 1);
      } else {
        e.model.position.x += e.vx * dt;
        e.model.position.z += e.vz * dt;
        e.model.position.y += e.vy * dt;
        e.vy -= 15 * dt;
        e.model.scale.setScalar(Math.max(0.05, e.life / e.max));
      }
    }
  }
  effects = effects.filter((e) => {
    if (e.life <= 0) {
      scene.remove(e.model);
      e.model.geometry.dispose();
      if (e.expand) e.model.material.dispose();
      return false;
    }
    return true;
  });
  effects = effects.filter((e) => {
    if (e.life <= 0) {
      scene.remove(e.model);
      e.model.geometry.dispose();
      if (e.expand) e.model.material.dispose();
      return false;
    }
    return true;
  });
}

/** 換局時把還在場上的特效清掉，連同它們的 GPU 資源。 */
export function clearEffects() {
  for (const e of effects) {
    scene.remove(e.model);
    // 光環自己 new 了材質，粒子用的是共用快取，不能釋放。
    disposeModel(e.model, e.expand);
  }
  effects = [];
}

export { playRing, playBurst };
