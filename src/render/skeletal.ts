/**
 * 有骨架與動作的 Blender 模型：英雄、小兵與熔岩龜的載入，以及播放動作的
 * SkeletalAnimator。
 *
 * 這裡只依賴 three 與 instancing.ts，不碰遊戲畫面（renderer.ts、terrain.ts），
 * 所以模型展示頁（src/showcase/）也能直接拿來用，看到的動作和遊戲裡一模一樣。
 * 單位的組裝（光環、程式拼的備用模型）在 models.ts。
 */
import * as THREE from "three";
import { HEROES } from "../data/heroes.js";
import { loadAnimatedModel, shadedMaterial } from "./instancing.js";
import swordsmanUrl from "../assets/models/hero_swordsman.glb?url";
import archerUrl from "../assets/models/hero_archer.glb?url";
import mageUrl from "../assets/models/hero_mage.glb?url";
import fighterUrl from "../assets/models/hero_fighter.glb?url";
import minionUrl from "../assets/models/minion.glb?url";
import turtleUrl from "../assets/models/turtle.glb?url";

interface HeroModel {
  url: string;
  /** .glb 裡的物件名稱 → 材質色（乘在頂點色上）。 */
  colors: Record<string, number>;
  /** 會自己發光的部位（法球）。 */
  glow?: string[];
}

/**
 * Blender 建的英雄模型（art/build_hero_*.py），索引與 HEROES 相同。
 * 固定色（皮膚、頭髮、武器……）都烘在各模型 `Gear` 物件的頂點色裡，來源是
 * 各腳本的 GEAR_COLORS，遊戲用白色材質畫；這裡只決定英雄代表色（和 UI 共用
 * HEROES[i].color）與會發光的部位。
 */
const HERO_MODELS: HeroModel[] = [
  { url: swordsmanUrl, colors: { Coat: HEROES[0].color, Gear: 0xffffff } },
  { url: archerUrl, colors: { Tunic: HEROES[1].color, Gear: 0xffffff } },
  { url: mageUrl, colors: { Robe: HEROES[2].color, Gear: 0xffffff, Orb: 0xbea0fc }, glow: ["Orb"] },
  { url: fighterUrl, colors: { Armor: HEROES[3].color, Gear: 0xffffff } },
];

/**
 * 已載入的英雄模型。每個英雄只載入一次，場上的每個單位都 clone 一份 ——
 * clone 共用幾何與材質，所以 disposeModel 要跳過標了 `shared` 的網格。
 *
 * 載入是非同步的，unitModel 卻得同步回傳；模型通常在選完英雄前就載好了，
 * 萬一還沒好（或載入失敗），那一隻就先用 unitModel 裡程式拼出來的版本。
 */
/** 一份已載入、可以 clone 的骨架模型與它的動作。 */
export interface RiggedTemplate {
  model: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

const loadedHeroes = new Map<number, RiggedTemplate>();
const heroLoads = HERO_MODELS.map(({ url, colors, glow = [] }, hero) =>
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
    }),
);

/**
 * Blender 建的小兵（art/build_minion.py）。只有兩個網格，場上同時有幾十隻：
 * `Team` 的頂點色只帶明暗，乘上隊伍色；`Gear` 的頂點色本身就帶顏色，用白色材質畫。
 * 兩隊共用同一份幾何與動作，只換 Team 的材質。
 */
const MINION_TEAM_COLORS = [0x428f99, 0xa95f68];
export const minionTeamMaterials = MINION_TEAM_COLORS.map((color) => shadedMaterial(color));
let loadedMinion: RiggedTemplate | undefined;
const minionLoad = loadAnimatedModel(minionUrl)
  .then(({ scene: model, animations }) => {
    const gear = shadedMaterial(0xffffff);
    model.traverse((o) => {
      const part = o as THREE.Mesh;
      if (!part.isMesh) return;
      if (part.name !== "Team" && part.name !== "Gear") throw new Error(`小兵模型多了 ${part.name} 網格`);
      part.material = part.name === "Team" ? minionTeamMaterials[0] : gear;
      part.castShadow = true;
      part.receiveShadow = true;
      part.userData.shared = true;
    });
    loadedMinion = { model, clips: animations };
  })
  .catch((error) => {
    console.error("小兵的模型載入失敗，改用程式生成的模型", error);
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
 * 英雄與小兵的動作：Idle、Walk、Attack（art/rig.py 與各模型腳本做的）。
 *
 * 上下半身分開混合：下半身只看有沒有在移動（Idle ↔ Walk）；上半身平常跟著
 * 下半身，攻擊時改播 Attack —— 射手邊跑邊射時腳照樣在跑。每組權重加起來都是 1，
 * 混合時才不會被拉回靜止姿勢。
 *
 * 角色面向滑鼠，移動方向卻不一定相同：下半身轉向實際移動的方向，往後移動時
 * 倒退跑（見 steer）。
 *
 * 只讀實體的 moving、swing（普攻時設為 0.18、逐格遞減）、位置與 facing，不碰模擬。
 */
/** 下半身最多相對上半身扭多少。 */
const LEG_TWIST = THREE.MathUtils.degToRad(75);
/** 移動方向偏離面向超過這個角度就改成倒退跑，回到 BACKPEDAL_EXIT 以內才恢復。 */
const BACKPEDAL_ENTER = THREE.MathUtils.degToRad(110);
const BACKPEDAL_EXIT = THREE.MathUtils.degToRad(70);
const tmpQuat = new THREE.Quaternion();
const tmpYaw = new THREE.Quaternion();
const tmpUp = new THREE.Vector3();

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

export class SkeletalAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction[];
  private readonly walk: THREE.AnimationAction[];
  private readonly attack?: THREE.AnimationAction;
  private walkWeight = 0;
  private attackWeight = 0;
  private lastSwing = 0;
  /** 動畫原速時腳往後蹬的速度（公尺／秒），art/rig.py 的 walk() 算好存在骨架上。 */
  private readonly walkSpeed: number;
  private speed = 0;
  private last?: { x: number; z: number };
  /** 最近一次的移動方向（世界座標的角度，與 facing 同一套）。 */
  private heading = 0;
  /** 下半身相對上半身轉了多少（弧度）；上半身反向扭回來，繼續面向 facing。 */
  private legYaw = 0;
  private backward = false;
  private readonly hips?: THREE.Object3D;
  private readonly spine?: THREE.Object3D;

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
    this.walkSpeed = Number(root.getObjectByName("Skeleton")?.userData.walk_speed) || 6;
    this.hips = root.getObjectByName("Hips");
    this.spine = root.getObjectByName("Spine");
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

  update(moving: boolean, swing: number, dt: number, x: number, z: number, facing: number) {
    // 依實際移動速度調整跑步的播放速度：腳往後蹬的速度等於身體前進的速度，
    // 踩地的腳才不會在地上滑。閃避、被擊退這類瞬間位移不算，夾在合理範圍內。
    if (this.last && dt > 0) {
      const dx = x - this.last.x,
        dz = z - this.last.z;
      const v = Math.hypot(dx, dz) / dt;
      this.speed += (v - this.speed) * Math.min(1, dt * 10);
      if (Math.hypot(dx, dz) > 1e-4) this.heading = Math.atan2(dx, dz);
    }
    this.last = { x, z };
    this.steer(moving, facing, dt);
    const pace = THREE.MathUtils.clamp(this.speed / this.walkSpeed, 0.6, 2);
    for (const a of this.walk) a.timeScale = this.backward ? -pace : pace;

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
    this.twist();
  }

  /**
   * 角色面向滑鼠（facing），移動方向卻可以是任何方向。腳要朝實際前進的方向跑，
   * 否則往後移動時看起來像倒著滑：
   * - 夾角不大時，下半身轉向移動方向、上半身反向扭回來，最多扭 LEG_TWIST。
   * - 往後方移動時改成倒退跑（Walk 倒著播），下半身只轉偏離正後方的那一點。
   * 進入與離開倒退跑的門檻不同，在臨界角度附近才不會來回切換。
   */
  private steer(moving: boolean, facing: number, dt: number) {
    let target = 0;
    if (moving && this.speed > 0.5) {
      const rel = wrapAngle(this.heading - facing);
      const off = Math.abs(rel);
      if (this.backward ? off < BACKPEDAL_EXIT : off > BACKPEDAL_ENTER) this.backward = !this.backward;
      target = THREE.MathUtils.clamp(this.backward ? wrapAngle(rel - Math.PI) : rel, -LEG_TWIST, LEG_TWIST);
    } else this.backward = false;
    this.legYaw += (target - this.legYaw) * Math.min(1, dt * 10);
  }

  /** 在動作之上疊加下半身的轉向；動作每格都會重寫骨頭的旋轉，所以不會累積。 */
  private twist() {
    if (!this.hips?.parent || !this.spine || Math.abs(this.legYaw) < 1e-3) return;
    // 「往上」在 Hips 父節點的座標裡是哪個方向
    this.hips.parent.getWorldQuaternion(tmpQuat);
    tmpUp.set(0, 1, 0).applyQuaternion(tmpQuat.invert());
    this.hips.quaternion.premultiply(tmpYaw.setFromAxisAngle(tmpUp, this.legYaw));
    // 同一個「往上」換到 Hips 自己的座標裡，Spine 反向轉回來
    tmpUp.applyQuaternion(tmpQuat.copy(this.hips.quaternion).invert());
    this.spine.quaternion.premultiply(tmpYaw.setFromAxisAngle(tmpUp, -this.legYaw));
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
 * 熔岩龜（art/build_turtle.py）。巨獸開戰三分鐘後才出現，通常早就載好了；
 * 萬一還沒好或載入失敗，models.ts 會改用程式拼的版本。
 *
 * 動作同樣交給 SkeletalAnimator：它的骨頭名稱都不在 LOWER_BODY 裡，整隻都算
 * 「上半身」，Idle ↔ Walk 的混合與出手時的 Attack 照常運作；沒有 Hips / Spine，
 * 下半身轉向自然就略過。
 */
let loadedTurtle: RiggedTemplate | undefined;
const turtleBody = shadedMaterial(0xffffff);
// 熔岩結晶與眼睛自己發光，暗處也看得見 —— 這隻是場上的爭奪目標，該醒目。
const turtleLava = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  vertexColors: true,
  flatShading: true,
  roughness: 0.6,
  emissive: 0xff7a2e,
  emissiveIntensity: 0.65,
});
const turtleLoad = loadAnimatedModel(turtleUrl)
  .then(({ scene: model, animations }) => {
    model.traverse((o) => {
      const part = o as THREE.Mesh;
      if (!part.isMesh) return;
      part.material = part.name === "TurtleLava" ? turtleLava : turtleBody;
      part.castShadow = true;
      part.receiveShadow = true;
      part.userData.shared = true;
    });
    loadedTurtle = { model, clips: animations };
  })
  .catch((error) => {
    console.error("熔岩龜的模型載入失敗，改用程式生成的模型", error);
  });

/** 這種單位已載好的骨架模型；沒有 Blender 版、還沒載好或載入失敗時是 undefined。 */
export function riggedTemplate(type: string, hero = 0): RiggedTemplate | undefined {
  if (type === "hero") return loadedHeroes.get(hero);
  if (type === "minion") return loadedMinion;
  if (type === "boss") return loadedTurtle;
  return undefined;
}

/** 全部骨架模型都載完（成功或失敗）時完成。遊戲不必等它，展示頁會等。 */
export const riggedReady: Promise<void> = Promise.all([...heroLoads, minionLoad, turtleLoad]).then(() => {});
