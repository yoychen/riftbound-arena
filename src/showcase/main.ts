/**
 * 模型展示頁：把 art/ 做出來的模型單獨拿出來看，並和原本程式拼的版本對照。
 *
 * 這一頁不載入遊戲本體（main.ts 會建整張地圖、接輸入），只借用呈現層裡
 * 不依賴遊戲畫面的部分：模型載入、instancing 工具與骨架動畫（rig.ts）。
 * 燈光與色調參數照抄 render/renderer.ts，看起來才和遊戲裡一致。
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { HEROES } from "../data/heroes.js";
import treeUrl from "../assets/models/tree.glb?url";
import rockUrl from "../assets/models/rock.glb?url";
import { createRng } from "../core/rng.js";
import { findGeometry, instanced, loadModel, shadedMaterial, type Placement } from "../render/instancing.js";
import { plantTrees, type TreePlacement } from "../render/trees.js";
import { createStructure, structuresReady } from "../render/structures.js";
import { TEAM_COLORS } from "../config/colors.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { minionTeamMaterials, riggedReady, riggedTemplate, SkeletalAnimator } from "../render/skeletal.js";

type Version = "blender" | "original";
type Mode = Version | "both";
/** 動畫片段名稱，與 .glb 裡的 Action 名稱相同。 */
type Clip = string;

/** 展示物上的動畫控制，掛在 object.userData.animator。 */
interface Animator {
  play(name: Clip): void;
  tick(dt: number): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ---- 場景：與遊戲相同的燈光與色調 ------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas: $<HTMLCanvasElement>("view"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x294340);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xdff9f5, 0x49653b, 2.25));
const sun = new THREE.DirectionalLight(0xffe6ae, 3.1);
sun.position.set(-28, 65, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 150 });
sun.shadow.bias = -0.001;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(60, 64),
  new THREE.MeshStandardMaterial({ color: 0x46674b, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 4;
controls.maxDistance = 160;

// ---- 原本的版本：照 render/models.ts 與 terrain.ts 的寫法重建，只供對照 ----

const legacyMaterials = new Map<string, THREE.MeshStandardMaterial>();
function legacyMat(color: number, emissive = 0) {
  const key = `${color}:${emissive}`;
  let m = legacyMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.88,
      flatShading: true,
      emissive: color,
      emissiveIntensity: emissive,
    });
    legacyMaterials.set(key, m);
  }
  return m;
}
function part(
  geometry: THREE.BufferGeometry,
  color: number,
  at: [number, number, number],
  parent: THREE.Object3D,
  emissive = 0,
) {
  const m = new THREE.Mesh(geometry, legacyMat(color, emissive));
  m.position.set(...at);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

const TINTS = [0x315d42, 0x3e724a, 0x547f48, 0x658b48];
const ROCK_COLORS = [0x8a9781, 0x737f72, 0xa9af91];

function legacyTree(scale: number, tint: number) {
  const tree = new THREE.Group();
  part(new THREE.CylinderGeometry(0.23, 0.4, 2, 5), 0x665c42, [0, 1, 0], tree);
  part(new THREE.IcosahedronGeometry(1.9 * scale, 0), tint, [0, 2.8 * scale, 0], tree);
  part(new THREE.IcosahedronGeometry(1.4 * scale, 0), 0x527c46, [0.6 * scale, 4 * scale, 0.2], tree);
  return tree;
}

function legacyRock(scale: number, color: number) {
  const rock = part(new THREE.IcosahedronGeometry(scale, 0), color, [0, scale * 0.6, 0], new THREE.Group());
  rock.scale.set(1.5, 0.9, 1);
  return rock;
}

function legacyTurtle() {
  const root = new THREE.Group();
  const shell = part(new THREE.IcosahedronGeometry(2.45, 1), 0x655548, [0, 1.8, 0], root);
  shell.scale.set(1, 0.7, 1.2);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    part(new THREE.ConeGeometry(0.48, 1.2, 5), 0xffa455, [Math.sin(a) * 1.6, 2.8, Math.cos(a) * 1.8], root, 0.6);
  }
  part(new THREE.IcosahedronGeometry(0.85, 0), 0x977155, [0, 1.25, 2.7], root);
  part(new THREE.IcosahedronGeometry(0.14, 0), 0xffcc74, [-0.4, 1.5, 3.35], root);
  part(new THREE.IcosahedronGeometry(0.14, 0), 0xffcc74, [0.4, 1.5, 3.35], root);
  for (const a of [-1, 1])
    for (const b of [-1, 1])
      part(new THREE.CylinderGeometry(0.5, 0.6, 0.8, 8), 0x7f6b52, [a * 1.7, 0.55, b * 1.7], root);
  return root;
}

/** 原本的英雄，照 render/models.ts 的 unitModel("hero") 重建。 */
function legacyTower(color: number) {
  const root = new THREE.Group();
  part(new THREE.CylinderGeometry(1.5, 1.8, 0.5, 8), 0x65796f, [0, 0.25, 0], root);
  part(new THREE.CylinderGeometry(0.8, 1.2, 3.1, 8), 0x879a8b, [0, 1.9, 0], root);
  part(new THREE.CylinderGeometry(1.2, 0.8, 0.6, 8), 0xb9c5aa, [0, 3.4, 0], root);
  root.userData.crystal = part(new THREE.OctahedronGeometry(0.65), color, [0, 4.3, 0], root, 0.8);
  return withCrystalSpin(root);
}

function legacyCore(color: number) {
  const root = new THREE.Group();
  part(new THREE.CylinderGeometry(2.2, 2.7, 1, 8), 0x627970, [0, 0.5, 0], root);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    part(new THREE.BoxGeometry(0.38, 2.5, 0.4), 0x9cab94, [Math.sin(a) * 1.8, 1.3, Math.cos(a) * 1.8], root);
  }
  const crystal = part(new THREE.OctahedronGeometry(1.7), color, [0, 3.1, 0], root, 0.75);
  crystal.scale.y = 1.4;
  root.userData.crystal = crystal;
  return withCrystalSpin(root);
}

/** 和遊戲一樣讓水晶自轉（main.ts 的 syncModels）。 */
function withCrystalSpin(root: THREE.Object3D): THREE.Object3D {
  const crystal = root.userData.crystal as THREE.Object3D;
  root.userData.animator = {
    play: () => {},
    tick: (dt) => {
      crystal.rotation.y += dt * 0.6;
    },
  } satisfies Animator;
  return root;
}

function legacyMinion() {
  const root = new THREE.Group();
  part(new THREE.CylinderGeometry(0.35, 0.42, 0.7, 5), 0x428f99, [0, 0.6, 0], root);
  part(new THREE.IcosahedronGeometry(0.28, 0), 0xc5c6a3, [0, 1.16, 0], root);
  part(new THREE.BoxGeometry(0.1, 0.8, 0.12), 0xb9cfc5, [0.5, 0.7, 0.2], root);
  return root;
}

function legacyHero(hero: number) {
  const root = new THREE.Group();
  const h = HEROES[hero];
  const bulky = hero === 3;
  part(new THREE.CylinderGeometry(bulky ? 0.78 : 0.48, bulky ? 0.85 : 0.6, 1.2, 6), h.color, [0, 1.1, 0], root);
  part(new THREE.IcosahedronGeometry(0.43, 1), 0xe4c9a0, [0, 2.02, 0], root);
  part(new THREE.BoxGeometry(0.67, 0.18, 0.68), hero === 2 ? 0x7d65ab : 0x324e4c, [0, 2.25, 0], root);
  part(new THREE.BoxGeometry(0.28, 0.62, 0.34), 0x294343, [-0.29, 0.35, 0], root);
  part(new THREE.BoxGeometry(0.28, 0.62, 0.34), 0x294343, [0.29, 0.35, 0], root);
  part(new THREE.ConeGeometry(0.7, 1.4, 4), h.color, [0, 1.25, -0.36], root).rotation.x = -0.25;
  if (hero === 0) {
    part(new THREE.BoxGeometry(0.15, 1.65, 0.16), 0xdbede3, [0.8, 1.4, 0.48], root);
    part(new THREE.BoxGeometry(0.7, 0.13, 0.2), 0xcbb477, [0.8, 0.8, 0.48], root);
  }
  if (hero === 1) {
    part(new THREE.TorusGeometry(0.7, 0.07, 4, 12, Math.PI), 0xe6bc66, [0.65, 1.3, 0.2], root).rotation.z = -Math.PI / 2;
    part(new THREE.BoxGeometry(0.04, 1.4, 0.04), 0xf0e0b3, [0.65, 1.3, 0.2], root);
  }
  if (hero === 2) {
    part(new THREE.CylinderGeometry(0.06, 0.07, 2.1, 8), 0xc5b58d, [0.75, 1.25, 0.15], root);
    part(new THREE.IcosahedronGeometry(0.32, 0), 0xbea0fc, [0.75, 2.35, 0.15], root);
    part(new THREE.CylinderGeometry(0, 0.64, 1.1, 6), 0x7f68aa, [0, 2.7, 0], root);
  }
  if (hero === 3) {
    part(new THREE.BoxGeometry(0.9, 1.1, 0.25), 0xc8ac70, [-0.95, 1.1, 0.35], root);
    part(new THREE.BoxGeometry(0.7, 0.6, 0.6), 0x859890, [1.05, 1.65, 0.3], root);
    part(new THREE.CylinderGeometry(0.09, 0.09, 1.2, 8), 0x6e6655, [1.05, 1, 0.3], root);
  }
  return root;
}

// ---- Blender 版本 ----------------------------------------------------------

/**
 * 和遊戲裡同一份骨架模型與同一個 SkeletalAnimator（render/skeletal.ts）。
 *
 * SkeletalAnimator 只看單位的狀態，不接受「播哪一段」的指令，所以這裡假裝
 * 有一個單位：按「待機」就停下、按「移動」就以動畫原速往前跑（只餵數字，
 * 模型本身不移動）、按「攻擊」就像遊戲裡普攻一樣把 swing 設成 0.18。
 * 動作的混合、跑步節奏全都和遊戲相同。沒有這種模型或載入失敗時回傳 null。
 */
async function rigged(type: "hero" | "minion" | "boss", hero = 0): Promise<THREE.Object3D | null> {
  await riggedReady;
  const template = riggedTemplate(type, hero);
  if (!template) return null;
  const model = cloneSkinned(template.model);
  if (type === "minion")
    model.traverse((o) => {
      if (o.name === "Team") (o as THREE.Mesh).material = minionTeamMaterials[0];
    });
  const animator = new SkeletalAnimator(model, template.clips);
  const speed = Number(model.getObjectByName("Skeleton")?.userData.walk_speed) || 6;
  const unit = { moving: false, swing: 0, x: 0, z: 0, facing: 0 };
  model.userData.animator = {
    play(name) {
      if (name === "Attack") unit.swing = 0.18;
      else unit.moving = name !== "Idle";
    },
    tick(dt) {
      if (unit.moving) unit.z += speed * dt;
      animator.update(unit.moving, unit.swing, dt, unit.x, unit.z, unit.facing);
      unit.swing = Math.max(0, unit.swing - dt);
    },
  } satisfies Animator;
  return model;
}

const modelCache = new Map<string, Promise<THREE.Object3D>>();
/** 同一個 .glb 只載一次。取出的幾何會被重複使用，標記起來，切換展示時不釋放。 */
const cachedModel = (url: string) => {
  if (!modelCache.has(url))
    modelCache.set(
      url,
      loadModel(url).then((model) => {
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.userData.fromModel = true;
        });
        return model;
      }),
    );
  return modelCache.get(url)!;
};

async function blenderTree(scale: number, tint: number) {
  const model = await cachedModel(treeUrl);
  const tree = new THREE.Group();
  const add = (name: string, color: number, s: number) => {
    const m = new THREE.Mesh(findGeometry(model, name), shadedMaterial(color));
    m.scale.setScalar(s);
    m.castShadow = m.receiveShadow = true;
    tree.add(m);
  };
  add("Trunk", 0x665c42, 1);
  add("Canopy", tint, scale);
  add("CanopyTop", 0x527c46, scale);
  return tree;
}

async function blenderRock(scale: number, color: number) {
  const model = await cachedModel(rockUrl);
  const rock = new THREE.Mesh(findGeometry(model, "Rock"), shadedMaterial(color));
  rock.position.y = scale * 0.6;
  rock.scale.set(1.5 * scale, 0.9 * scale, scale);
  rock.castShadow = rock.receiveShadow = true;
  return rock;
}

// ---- 森林：同一批擺放，兩種畫法 ------------------------------------------

interface Forest {
  trees: TreePlacement[];
  rocks: (Placement & { color: number })[];
}

function forestLayout(): Forest {
  const rng = createRng(7);
  const trees: TreePlacement[] = [];
  const rocks: Forest["rocks"] = [];
  while (trees.length < 150) {
    const x = rng() * 32 - 16;
    const z = rng() * 32 - 16;
    if (Math.hypot(x, z) > 16 || Math.hypot(x, z) < 3) continue;
    trees.push({ x, z, scale: 0.75 + rng() * 1.05, tint: trees.length % 4 });
  }
  while (rocks.length < 40) {
    const x = rng() * 32 - 16;
    const z = rng() * 32 - 16;
    if (Math.hypot(x, z) > 16) continue;
    const s = 0.4 + rng();
    rocks.push({
      x,
      y: s * 0.6,
      z,
      rotationY: rng() * 6,
      scale: { x: 1.5 * s, y: 0.9 * s, z: s },
      color: ROCK_COLORS[rocks.length % 3],
    });
  }
  return { trees, rocks };
}

function legacyForest(layout: Forest) {
  const root = new THREE.Group();
  for (const t of layout.trees) {
    const tree = legacyTree(t.scale, TINTS[t.tint]);
    tree.position.set(t.x, 0, t.z);
    root.add(tree);
  }
  for (const r of layout.rocks) {
    const rock = part(new THREE.IcosahedronGeometry(1, 0), r.color, [r.x, r.y, r.z], root);
    rock.rotation.y = r.rotationY;
    rock.scale.set(r.scale.x, r.scale.y, r.scale.z);
  }
  return root;
}

async function blenderForest(layout: Forest) {
  const root = new THREE.Group();
  await plantTrees(layout.trees, root);
  const rock = await cachedModel(rockUrl);
  root.add(
    instanced(
      findGeometry(rock, "Rock"),
      shadedMaterial(0xffffff),
      layout.rocks,
      layout.rocks.map((r) => r.color),
    ),
  );
  return root;
}

// ---- 展示清單 --------------------------------------------------------------

interface Showcase {
  id: string;
  name: string;
  sub: string;
  desc: Record<Version, string>;
  /** 可以播的動畫片段與按鈕文字；沒有就不顯示動畫列。 */
  clips?: { name: Clip; label: string }[];
  /** 鏡頭距離與注視高度。 */
  distance: number;
  lookY: number;
  /** 並排比較時兩邊各往外移多少。 */
  offset: number;
  build: (version: Version) => Promise<THREE.Object3D>;
}

const SHOWCASES: Showcase[] = [
  {
    id: "turtle",
    name: "熔岩龜",
    sub: "骨架 · 3 段動作",
    clips: [
      { name: "Idle", label: "待機" },
      { name: "Walk", label: "爬行" },
      { name: "Attack", label: "攻擊" },
    ],
    distance: 17,
    lookY: 1.6,
    offset: 4.6,
    desc: {
      blender:
        "Blender 建模，內含 6 根骨頭的骨架（身體、頭、四隻腳）。遊戲依狀態自動切換動畫：移動時爬行、出手時攻擊，其他時間待機。按上面的按鈕可以手動播放。",
      original:
        "原本用程式拼出來的版本：一顆壓扁的球當殼、四根圓柱當腳。零件彼此獨立，沒有骨架，所以不會動，只會整隻轉向。",
    },
    build: async (version) => {
      if (version === "original") return legacyTurtle();
      return (await rigged("boss")) ?? legacyTurtle();
    },
  },
  ...(
    [
      ["swordsman", "長劍與圍巾"],
      ["archer", "短披風與長弓"],
      ["mage", "長袍與發光的法球，腿藏在袍子裡，袍擺跟著大腿擺動"],
      ["fighter", "盔甲、盾牌與石錘"],
    ] as const
  ).map(
    ([id, gear], hero): Showcase => ({
      id,
      name: HEROES[hero].name,
      sub: "骨架 · 3 段動作",
      clips: [
        { name: "Idle", label: "待機" },
        { name: "Walk", label: "奔跑" },
        { name: "Attack", label: "攻擊" },
      ],
      distance: 8,
      lookY: 1.3,
      offset: 1.7,
      desc: {
        blender: `遊戲裡用的 Blender 版：${gear}。上下半身分開混合，邊跑邊攻擊時腳照樣在跑；跑步節奏跟著移動速度，腳不會在地上滑。`,
        original:
          "原本的版本：圓柱當身體、球當頭、方塊當腳，武器是幾個方塊。沒有骨架，移動時只會整個人上下彈跳。",
      },
      build: async (version) =>
        version === "original" ? legacyHero(hero) : ((await rigged("hero", hero)) ?? legacyHero(hero)),
    }),
  ),
  {
    id: "minion",
    name: "小兵",
    sub: "骨架 · 隊伍色",
    clips: [
      { name: "Idle", label: "待機" },
      { name: "Walk", label: "行軍" },
      { name: "Attack", label: "攻擊" },
    ],
    distance: 6,
    lookY: 0.8,
    offset: 1.2,
    desc: {
      blender:
        "遊戲裡用的 Blender 版：只有兩個網格（隊伍色的上衣、盔纓、盾面，和其餘裝備），場上同時有幾十隻也只多兩次繪製。兩隊共用同一份模型，只換顏色。",
      original: "原本的版本：一根五角柱當身體、一顆球當頭，加一根方條當武器。",
    },
    build: async (version) => (version === "original" ? legacyMinion() : ((await rigged("minion")) ?? legacyMinion())),
  },
  {
    id: "tower",
    name: "防禦塔",
    sub: "石塔 ＋ 隊伍色水晶",
    distance: 17,
    lookY: 2.4,
    offset: 3.4,
    desc: {
      blender:
        "Blender 版：兩層台座、往上收窄的六角塔身、三根扶壁、外擴的塔頂與六個城垛，三根青銅爪托著水晶。水晶和塔身的窗縫發出隊伍色的光，同一份模型兩隊共用。",
      original: "原本的版本：三段圓柱疊成塔身，頂上一顆正八面體當水晶。",
    },
    build: async (version) => {
      if (version === "original") return legacyTower(TEAM_COLORS[0]);
      await structuresReady;
      const tower = createStructure("tower", TEAM_COLORS[0]);
      return tower ? withCrystalSpin(tower) : legacyTower(TEAM_COLORS[0]);
    },
  },
  {
    id: "core",
    name: "核心",
    sub: "祭壇 ＋ 繞行碎晶",
    distance: 22,
    lookY: 2.6,
    offset: 4.4,
    desc: {
      blender:
        "Blender 版：兩層十角形祭壇、五根往內傾的方尖石柱（中段一圈發光符文環），中央基座上浮著主水晶，兩顆小碎晶跟著它一起轉。",
      original: "原本的版本：一個圓台、五根方柱，中間一顆拉長的正八面體。",
    },
    build: async (version) => {
      if (version === "original") return legacyCore(TEAM_COLORS[1]);
      await structuresReady;
      const core = createStructure("core", TEAM_COLORS[1]);
      return core ? withCrystalSpin(core) : legacyCore(TEAM_COLORS[1]);
    },
  },
  {
    id: "tree",
    name: "樹",
    sub: "兩團 20 面樹冠",
    distance: 22,
    lookY: 2.6,
    offset: 5.2,
    desc: {
      blender:
        "Blender 版刻意維持原本的簡單風格：樹冠仍是兩團 20 面的多面球，只加了一點點起伏，並讓底部略暗。樹是背景，細節太多會搶走角色的注意力。",
      original: "原本的樹：一根五角柱加兩顆正二十面體，三個零件疊在一起。",
    },
    build: async (version) => {
      const root = new THREE.Group();
      const trees: [number, number, number, number][] = [
        [-2.2, -0.8, 1.0, 1],
        [2.0, -1.4, 0.85, 3],
        [0.2, 1.9, 1.15, 0],
      ];
      for (const [x, z, s, tint] of trees) {
        const tree = version === "original" ? legacyTree(s, TINTS[tint]) : await blenderTree(s, TINTS[tint]);
        tree.position.set(x, 0, z);
        root.add(tree);
      }
      return root;
    },
  },
  {
    id: "rock",
    name: "石頭",
    sub: "不規則 20 面體",
    distance: 10,
    lookY: 0.4,
    offset: 3.2,
    desc: {
      blender: "Blender 版的石頭：同樣是 20 面，但頂點有高低起伏，看起來比較像自然的石塊，底部壓暗讓它「坐」在地上。",
      original: "原本的石頭：一顆正二十面體壓扁成 1.5 × 0.9 × 1，每一顆形狀都完全相同。",
    },
    build: async (version) => {
      const root = new THREE.Group();
      const rocks: [number, number, number, number][] = [
        [-1.6, 0.2, 1.0, 0],
        [1.3, -0.6, 0.7, 1],
        [0.4, 1.5, 0.5, 2],
      ];
      for (const [x, z, s, c] of rocks) {
        const rock = version === "original" ? legacyRock(s, ROCK_COLORS[c]) : await blenderRock(s, ROCK_COLORS[c]);
        rock.position.x += x;
        rock.position.z += z;
        rock.rotation.y = x;
        root.add(rock);
      }
      return root;
    },
  },
  {
    id: "forest",
    name: "森林",
    sub: "150 棵樹的效能差異",
    distance: 60,
    lookY: 0,
    offset: 17,
    desc: {
      blender:
        "同樣 150 棵樹、40 顆石頭，用 instancing 畫：同一種東西只交代顯示卡一次，數量多少都一樣。對照「原本」看下面的 draw calls。",
      original:
        "原本的畫法：每棵樹 3 個零件、每個零件各交代一次，再加上陰影又一次。150 棵樹光是樹就要九百多次。",
    },
    build: async (version) => {
      const layout = forestLayout();
      return version === "original" ? legacyForest(layout) : blenderForest(layout);
    },
  },
];

// ---- 狀態與畫面組裝 --------------------------------------------------------

const state = {
  showcase: SHOWCASES[0],
  mode: "blender" as Mode,
  clip: "Idle" as Clip,
  spin: true,
  wire: false,
};

const animatorOf = (object: THREE.Object3D) => object.userData.animator as Animator | undefined;

/** 目前場上的展示物，並排時有兩個。 */
let shown: { version: Version; object: THREE.Object3D }[] = [];
/** 每次切換都加一，晚到的非同步結果若不是最新的就丟掉。 */
let buildToken = 0;

function disposeShown() {
  for (const { object } of shown) {
    scene.remove(object);
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || o.userData.shared) return;
      // 從 .glb 快取取出的幾何會被下一次重用，只釋放自己 new 的。
      if (!(mesh.geometry.userData.fromModel)) mesh.geometry.dispose();
    });
  }
  shown = [];
}

function applyWireframe() {
  for (const { object } of shown)
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.MeshStandardMaterial).wireframe = state.wire;
    });
  for (const m of legacyMaterials.values()) m.wireframe = state.wire;
}

/** 算出一組物件自己花了多少 draw call 與三角形：單獨畫一次，扣掉地面。 */
function measure(target: THREE.Object3D | null) {
  for (const { object } of shown) object.visible = object === target;
  renderer.render(scene, camera);
  const result = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles };
  for (const { object } of shown) object.visible = true;
  return result;
}

function updateStats() {
  const base = measure(null);
  const stat = (object: THREE.Object3D) => {
    const r = measure(object);
    return { calls: r.calls - base.calls, tris: r.tris - base.tris };
  };
  const fmt = (n: number) => n.toLocaleString("en-US");
  if (shown.length === 2) {
    const [a, b] = shown.map((s) => stat(s.object));
    $("calls").textContent = `${fmt(a.calls)} → ${fmt(b.calls)}`;
    $("tris").textContent = `${fmt(a.tris)} → ${fmt(b.tris)}`;
  } else if (shown.length === 1) {
    const r = stat(shown[0].object);
    $("calls").textContent = fmt(r.calls);
    $("tris").textContent = fmt(r.tris);
  }
}

function frameCamera() {
  const sc = state.showcase;
  // 直式畫面的水平視角窄，鏡頭要拉遠才放得下。
  const portrait = camera.aspect < 1 ? 0.8 / camera.aspect : 1;
  const distance = sc.distance * (state.mode === "both" ? 1.45 : 1) * Math.max(1, portrait);
  const dir = new THREE.Vector3(0.62, 0.55, 1).normalize();
  controls.target.set(0, sc.lookY, 0);
  camera.position.copy(controls.target).addScaledVector(dir, distance);
  controls.update();
}

async function rebuild() {
  const token = ++buildToken;
  const sc = state.showcase;
  const versions: Version[] = state.mode === "both" ? ["original", "blender"] : [state.mode];
  const built = await Promise.all(versions.map((v) => sc.build(v)));
  if (token !== buildToken) return; // 使用者已經切到別的了

  disposeShown();
  built.forEach((object, i) => {
    const version = versions[i];
    // 並排時原本在左、Blender 在右。
    if (versions.length === 2) object.position.x = (i === 0 ? -1 : 1) * sc.offset;
    scene.add(object);
    shown.push({ version, object });
  });
  if (sc.clips) for (const { object } of shown) animatorOf(object)?.play(state.clip);
  applyWireframe();
  frameCamera();
  renderUi();
  updateStats();
}

// ---- 面板 ------------------------------------------------------------------

const modelNav = $("models");
modelNav.innerHTML = SHOWCASES.map(
  (s) => `<button data-model="${s.id}"><b>${s.name}</b><small>${s.sub}</small></button>`,
).join("");

function renderUi() {
  const sc = state.showcase;
  for (const b of modelNav.querySelectorAll<HTMLButtonElement>("button"))
    b.classList.toggle("active", b.dataset.model === sc.id);
  for (const b of $("versions").querySelectorAll<HTMLButtonElement>("button"))
    b.classList.toggle("active", b.dataset.version === state.mode);
  $("clipGroup").hidden = !sc.clips;
  // 原本的版本沒有動畫可播。
  const off = state.mode === "original" ? "disabled" : "";
  $("clips").innerHTML = (sc.clips ?? [])
    .map((c) => `<button data-clip="${c.name}" class="${c.name === state.clip ? "active" : ""}" ${off}>${c.label}</button>`)
    .join("");
  $("desc").textContent =
    state.mode === "both"
      ? `左：原本　右：Blender\n${sc.desc.blender}`
      : sc.desc[state.mode];
  $("tagLeft").classList.toggle("show", state.mode === "both");
  $("tagRight").classList.toggle("show", state.mode === "both");
  $("tagLeft").textContent = "原本";
  $("tagRight").textContent = "Blender";
  history.replaceState(null, "", `#${sc.id}`);
}

modelNav.addEventListener("click", (e) => {
  const id = (e.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.model;
  const next = SHOWCASES.find((s) => s.id === id);
  if (!next || next === state.showcase) return;
  state.showcase = next;
  state.clip = "Idle";
  void rebuild();
});

$("versions").addEventListener("click", (e) => {
  const mode = (e.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.version as Mode | undefined;
  if (!mode || mode === state.mode) return;
  state.mode = mode;
  void rebuild();
});

$("clips").addEventListener("click", (e) => {
  const clip = (e.target as HTMLElement).closest<HTMLButtonElement>("button")?.dataset.clip as Clip | undefined;
  if (!clip) return;
  state.clip = clip;
  for (const { object } of shown) animatorOf(object)?.play(clip);
  renderUi();
});

$<HTMLInputElement>("spin").addEventListener("change", (e) => {
  state.spin = (e.target as HTMLInputElement).checked;
});
$<HTMLInputElement>("wire").addEventListener("change", (e) => {
  state.wire = (e.target as HTMLInputElement).checked;
  applyWireframe();
});

// ---- 迴圈 ------------------------------------------------------------------

/**
 * 面板蓋住畫面的一部分，把畫面中心移到「沒被蓋住的區域」中央：
 * 桌面版面板在左，往右移；手機版面板在下，往上移。
 */
function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const panel = $("panel").getBoundingClientRect();
  const bottomSheet = panel.width >= w - 1;
  const shiftX = bottomSheet ? 0 : -panel.right / 2;
  const shiftY = bottomSheet ? panel.height / 2 : 0;
  camera.setViewOffset(w, h, shiftX, shiftY, w, h);
  camera.updateProjectionMatrix();
}
addEventListener("resize", () => {
  resize();
  frameCamera();
});
resize();

const tagPoint = new THREE.Vector3();
function placeTags() {
  if (shown.length !== 2) return;
  shown.forEach(({ object }, i) => {
    tagPoint.set(object.position.x, 0, 0).project(camera);
    const tag = $(i === 0 ? "tagLeft" : "tagRight");
    tag.style.left = `${((tagPoint.x + 1) / 2) * innerWidth}px`;
  });
}

let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  for (const { object } of shown) {
    if (state.spin) object.rotation.y += dt * 0.35;
    animatorOf(object)?.tick(dt);
  }
  controls.update();
  renderer.render(scene, camera);
  placeTags();
}

const initial = SHOWCASES.find((s) => `#${s.id}` === location.hash);
if (initial) state.showcase = initial;
await rebuild();
requestAnimationFrame(frame);
