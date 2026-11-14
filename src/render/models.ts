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
import { loadAnimatedModel, shadedMaterial } from "./instancing.js";
import swordsmanUrl from "../assets/models/hero_swordsman.glb?url";
import archerUrl from "../assets/models/hero_archer.glb?url";
import mageUrl from "../assets/models/hero_mage.glb?url";
import fighterUrl from "../assets/models/hero_fighter.glb?url";

const worldEntities = new THREE.Group();
scene.add(worldEntities);

const SKIN = 0xe4c9a0;
const PANTS = 0x294343;
const BOOTS = 0x5a4636;

interface HeroModel {
  url: string;
  /** .glb 裡的物件名稱 → 色相。模型只帶明暗。 */
  colors: Record<string, number>;
  /** 會自己發光的部位（法球）。 */
  glow?: string[];
}

/**
 * Blender 建的英雄模型（art/build_hero_*.py），索引與 HEROES 相同。
 * 調色盤集中在這裡；各腳本裡的 PREVIEW_TINTS 只是渲染預覽圖用的副本。
 */
const HERO_MODELS: HeroModel[] = [
  {
    url: swordsmanUrl,
    colors: {
      Coat: HEROES[0].color,
      Skin: SKIN,
      Dark: PANTS,
      Boots: BOOTS,
      Hair: 0x324e4c,
      Scarf: 0xeef3ea,
      Blade: 0xdbede3,
      Gold: 0xcbb477,
    },
  },
  {
    url: archerUrl,
    colors: {
      Tunic: HEROES[1].color,
      Skin: SKIN,
      Dark: PANTS,
      Boots: BOOTS,
      Hair: 0x8a4b2f,
      Cloak: 0x3c6650,
      Leather: 0x7a5236,
      Bow: 0xe6bc66,
      String: 0xf0e0b3,
      Star: 0xfff1b8,
    },
  },
  {
    url: mageUrl,
    colors: {
      Robe: HEROES[2].color,
      Trim: 0x7d65ab,
      Skin: SKIN,
      Dark: PANTS,
      Hair: 0xdcd6ec,
      Sash: 0xe0c27a,
      Shoes: 0x3d3350,
      Staff: 0xc5b58d,
      Orb: 0xbea0fc,
      Moon: 0xf2dc9b,
    },
    glow: ["Orb"],
  },
  {
    url: fighterUrl,
    colors: {
      Armor: HEROES[3].color,
      Plate: 0x859890,
      Stone: 0x9a9282,
      Skin: SKIN,
      Dark: PANTS,
      Boots: BOOTS,
      Beard: 0x8a5a3a,
      Shield: 0xc8ac70,
      Wood: 0x6e6655,
    },
  },
];

/**
 * 已載入的英雄模型。每個英雄只載入一次，場上的每個單位都 clone 一份 ——
 * clone 共用幾何與材質，所以 disposeModel 要跳過標了 `shared` 的網格。
 *
 * 載入是非同步的，unitModel 卻得同步回傳；模型通常在選完英雄前就載好了，
 * 萬一還沒好（或載入失敗），那一隻就先用 unitModel 裡程式拼出來的版本。
 */
const loadedHeroes = new Map<number, { model: THREE.Object3D; clips: THREE.AnimationClip[] }>();
HERO_MODELS.forEach(({ url, colors, glow = [] }, hero) => {
  loadAnimatedModel(url)
    .then(({ scene: model, animations }) => {
      model.traverse((o) => {
        const part = o as THREE.Mesh;
        if (!part.isMesh) return;
        const color = colors[part.name];
        if (color === undefined) throw new Error(`英雄模型的 ${part.name} 沒有對應的顏色`);
        const material = shadedMaterial(color);
        if (glow.includes(part.name)) {
          material.emissive.setHex(color);
          material.emissiveIntensity = 0.7;
        }
        part.material = material;
        part.castShadow = true;
        part.receiveShadow = true;
        part.userData.shared = true;
      });
      loadedHeroes.set(hero, { model, clips: animations });
    })
    .catch((error) => {
      console.error(`英雄 ${hero} 的模型載入失敗，改用程式生成的模型`, error);
    });
});

/** 下半身的骨頭；其餘（Spine 以上與雙手）是上半身。名稱見 art/rig.py。 */
const LOWER_BODY = /^(Hips|Thigh|Shin|Foot)/;

function bodyHalf(clip: THREE.AnimationClip, lower: boolean): THREE.AnimationClip {
  return new THREE.AnimationClip(
    `${clip.name}.${lower ? "lower" : "upper"}`,
    clip.duration,
    clip.tracks.filter((t) => LOWER_BODY.test(t.name) === lower),
  );
}

/**
 * 英雄的動作：Idle、Walk、Attack（art/rig.py 與各英雄腳本做的）。
 *
 * 上下半身分開混合：下半身只看有沒有在移動（Idle ↔ Walk）；上半身平常跟著
 * 下半身，攻擊時改播 Attack —— 射手邊跑邊射時腳照樣在跑。每組權重加起來都是 1，
 * 混合時才不會被拉回靜止姿勢。
 *
 * 只讀實體的 moving 與 swing（普攻時設為 0.18、逐格遞減），不碰模擬。
 */
class HeroAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction[];
  private readonly walk: THREE.AnimationAction[];
  private readonly attack?: THREE.AnimationAction;
  private walkWeight = 0;
  private attackWeight = 0;
  private lastSwing = 0;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    const clip = (name: string) => clips.find((c) => c.name === name);
    const halves = (name: string) => {
      const c = clip(name);
      if (!c) throw new Error(`英雄模型缺少 ${name} 動作`);
      return [bodyHalf(c, true), bodyHalf(c, false)].map((h) => {
        const action = this.mixer.clipAction(h);
        action.play();
        return action;
      });
    };
    this.idle = halves("Idle");
    this.walk = halves("Walk");
    // 每隻英雄的呼吸錯開，站在一起時才不會同步起伏。
    for (const a of this.idle) a.time = Math.random() * a.getClip().duration;
    const attack = clip("Attack");
    if (attack) {
      this.attack = this.mixer.clipAction(bodyHalf(attack, false));
      this.attack.setLoop(THREE.LoopOnce, 1);
      this.attack.clampWhenFinished = true;
    }
    this.apply();
  }

  update(moving: boolean, swing: number, dt: number) {
    if (this.attack && swing > this.lastSwing + 1e-4) {
      this.attack.reset().play();
      this.attackWeight = 1;
    }
    this.lastSwing = swing;
    const attacking =
      !!this.attack && this.attack.isRunning() && this.attack.time < this.attack.getClip().duration - 0.08;
    this.walkWeight += ((moving ? 1 : 0) - this.walkWeight) * Math.min(1, dt * 12);
    this.attackWeight += ((attacking ? 1 : 0) - this.attackWeight) * Math.min(1, dt * 20);
    this.apply();
    this.mixer.update(dt);
  }

  private apply() {
    const w = this.walkWeight,
      a = this.attack ? this.attackWeight : 0;
    this.idle[0].setEffectiveWeight(1 - w);
    this.walk[0].setEffectiveWeight(w);
    this.idle[1].setEffectiveWeight((1 - w) * (1 - a));
    this.walk[1].setEffectiveWeight(w * (1 - a));
    this.attack?.setEffectiveWeight(a);
  }
}

/**
 * 推進單位的骨架動作。回傳 false 表示這個模型沒有動作（程式拼出來的模型），
 * 呼叫端就沿用原本「移動時整隻上下跳」的表現。
 */
export function animateUnit(model: THREE.Object3D, moving: boolean, swing: number, dt: number): boolean {
  const animator = model.userData.animator as HeroAnimator | undefined;
  animator?.update(moving, swing, dt);
  return !!animator;
}

function unitModel(type: string, team: number, hero = 0): THREE.Group {
  const root = new THREE.Group();
  const c = team < 0 ? 0xcf7446 : teamColors[team];
  const blenderHero = type === "hero" ? loadedHeroes.get(hero) : undefined;
  if (blenderHero) {
    // 有骨架的模型要用 SkeletonUtils 複製，骨頭才會接到新的那一份。
    const body = cloneSkinned(blenderHero.model);
    root.add(body);
    if (blenderHero.clips.length) root.userData.animator = new HeroAnimator(body, blenderHero.clips);
  } else if (type === "hero") {
    const h = HEROES[hero],
      bulky = hero === 3;
    const body = cyl(
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
    const head = sphere(0.43, 0xe4c9a0, 0, 2.02, 0, root, 1);
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
  return root;
}
/**
 * 建立單位並掛上模型。
 *
 * 數值與實體結構由核心層決定，這裡只負責補上 THREE 的部分 ——
 * 模擬層從不讀取 `model`。
 */

/** 區域傷害的地面圓盤。模擬只給座標、半徑與顏色。 */
function zoneMesh(x: number, z: number, r: number, color: number) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 40),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.19,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.12, z);
  scene.add(m);
  return m;
}

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
    if (o.userData.shared) return; // 共用的英雄模型，下一場還要用
    const mesh = o as Partial<THREE.Mesh>;
    mesh.geometry?.dispose();
    if (disposeMaterial) (mesh.material as THREE.Material | undefined)?.dispose();
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

export { worldEntities, unitModel, zoneMesh };
