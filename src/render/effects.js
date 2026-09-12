/**
 * 短命的視覺效果：擴散光環與粒子爆散。
 *
 * 模擬層只送出 `ring` 與 `burst` 事件，生命週期完全由這裡保管 ——
 * 特效持有 THREE 網格，所以它不能放進 world。
 */
import * as THREE from "three";
import { clamp } from "../core/vec.js";
import { mesh, scene, sphere } from "./renderer.js";
import { rand } from "../core/vec.js";

let effects = [];

function playRing(x, z, r, color, life = 0.45) {
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
  effects.push({ model: m, life, max: life, expand: true });
}
function playBurst(x, z, color, count = 10) {
  for (let i = 0; i < count; i++) {
    const m = sphere(0.12, color, x, 0.6, z, scene);
    effects.push({
      model: m,
      life: rand(0.2, 0.55),
      max: 0.55,
      vx: rand(-7, 7),
      vz: rand(-7, 7),
      vy: rand(2, 7),
    });
  }
}

/** 依 dt 推進特效；`animate` 為假時凍結（暫停畫面）但仍保留。 */
export function stepEffects(dt, animate) {
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

/** 換局時把還在場上的特效清掉。 */
export function clearEffects() {
  for (const e of effects) scene.remove(e.model);
  effects = [];
}

export { playRing, playBurst };
