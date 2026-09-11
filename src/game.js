import * as THREE from "three";
import { HEROES } from "./data/heroes.js";
import { commonUpgrades, heroUpgrades } from "./data/evolutions.js";
import { clamp, clock, dist, rand } from "./core/vec.js";
import { createRng, TERRAIN_SEED } from "./core/rng.js";
import { createNavigation } from "./core/navigation.js";
import { createWorld } from "./core/world.js";
import { createUnit } from "./core/entities.js";
import { enemies, targetFor } from "./core/targeting.js";
import { damage, kill } from "./core/combat.js";
const $ = (id) => document.getElementById(id);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: $("world"),
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (e) {
  $("overlay").innerHTML =
    '<div class="modal"><h2>無法啟動 3D 畫面</h2><p>請使用支援 WebGL 的瀏覽器，並開啟硬體加速後重新整理。</p></div>';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x294340);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x456259, 0.006);
const camera = new THREE.PerspectiveCamera(
  43,
  innerWidth / innerHeight,
  0.1,
  230,
);
camera.position.set(2, 48, 44);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xdff9f5, 0x49653b, 2.25));
const sun = new THREE.DirectionalLight(0xffe6ae, 3.1);
sun.position.set(-28, 65, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -60,
  right: 60,
  top: 60,
  bottom: -60,
  near: 1,
  far: 150,
});
sun.shadow.bias = -0.001;
scene.add(sun);
const materials = new Map();
function mat(c, em = 0) {
  const k = c + ":" + em;
  if (!materials.has(k))
    materials.set(
      k,
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.88,
        flatShading: true,
        emissive: c,
        emissiveIntensity: em,
      }),
    );
  return materials.get(k);
}
function mesh(geo, c, x = 0, y = 0, z = 0, parent = scene, em = 0) {
  const m = new THREE.Mesh(geo, mat(c, em));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const box = (w, h, d, c, x, y, z, p) =>
    mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z, p),
  sphere = (r, c, x, y, z, p, detail = 0) =>
    mesh(new THREE.IcosahedronGeometry(r, detail), c, x, y, z, p),
  cyl = (rt, rb, h, c, x, y, z, p, n = 8) =>
    mesh(new THREE.CylinderGeometry(rt, rb, h, n), c, x, y, z, p);
const mapRoot = new THREE.Group();
scene.add(mapRoot);
box(94, 2, 80, 0x46674b, 0, -1.2, 0, mapRoot);
box(98, 4, 84, 0x344e40, 0, -4, 0, mapRoot);
box(102, 4, 88, 0x263f36, 0, -8, 0, mapRoot);
const lanes = [
  [
    new THREE.Vector3(-34, 0, 25),
    new THREE.Vector3(-28, 0, 13),
    new THREE.Vector3(-27, 0, -9),
    new THREE.Vector3(-17, 0, -23),
    new THREE.Vector3(10, 0, -24),
    new THREE.Vector3(34, 0, -25),
  ],
  [
    new THREE.Vector3(-34, 0, 25),
    new THREE.Vector3(-12, 0, 25),
    new THREE.Vector3(14, 0, 23),
    new THREE.Vector3(27, 0, 8),
    new THREE.Vector3(28, 0, -12),
    new THREE.Vector3(34, 0, -25),
  ],
];
const curves = lanes.map((p) => new THREE.CatmullRomCurve3(p));
const lanePoints = curves.map((c) => c.getPoints(160));
function strip(points, width, color, y) {
  const verts = [],
    idx = [];
  points.forEach((p, i) => {
    const next = points[Math.min(points.length - 1, i + 1)],
      prev = points[Math.max(0, i - 1)];
    let dx = next.x - prev.x,
      dz = next.z - prev.z,
      l = Math.hypot(dx, dz) || 1;
    verts.push(
      p.x - ((dz / l) * width) / 2,
      y,
      p.z + ((dx / l) * width) / 2,
      p.x + ((dz / l) * width) / 2,
      y,
      p.z - ((dx / l) * width) / 2,
    );
    if (i < points.length - 1) {
      let n = i * 2;
      idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
    }
  });
  let g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  let m = mesh(g, color, 0, 0, 0, mapRoot);
  m.castShadow = false;
  return m;
}
lanePoints.forEach((p) => {
  strip(p, 8, 0x73835a, 0.005);
  strip(p, 6.5, 0xb9b98a, 0.035);
});
const river = [];
for (let i = 0; i <= 100; i++) {
  let x = -46 + i * 0.92;
  river.push(new THREE.Vector3(x, 0, -x * 0.47 + Math.sin(x * 0.12) * 2));
}
strip(river, 6, 0x46786e, 0.06);
strip(river, 4.5, 0x3b9b94, 0.08);
for (const p of lanePoints.flat().filter((p, i) => i % 4 === 0)) {
  if (Math.abs(p.z - (-p.x * 0.47 + Math.sin(p.x * 0.12) * 2)) < 4) {
    box(7.2, 0.24, 2.4, 0x969a79, p.x, 0.2, p.z, mapRoot);
  }
}
cyl(8, 8, 0.25, 0x66755b, 0, 0.1, 0, mapRoot, 24);
cyl(6.9, 6.9, 0.25, 0x4a554b, 0, 0.2, 0, mapRoot, 24);
const pitRing = mesh(
  new THREE.TorusGeometry(7.2, 0.13, 5, 40),
  0xc59657,
  0,
  0.34,
  0,
  mapRoot,
  0.1,
);
pitRing.rotation.x = Math.PI / 2;
const seeded = createRng(TERRAIN_SEED);
const obstacles = [];
function nearLane(x, z, d = 6) {
  return lanePoints.some((ps) =>
    ps.some((p, i) => i % 3 === 0 && Math.hypot(x - p.x, z - p.z) < d),
  );
}
for (let i = 0; i < 360; i++) {
  let x = seeded() * 88 - 44,
    z = seeded() * 72 - 36;
  if (
    nearLane(x, z) ||
    Math.hypot(x, z) < 10 ||
    Math.abs(z + x * 0.47 - Math.sin(x * 0.12) * 2) < 4 ||
    Math.hypot(x + 34, z - 25) < 10 ||
    Math.hypot(x - 34, z + 25) < 10
  )
    continue;
  let s = 0.75 + seeded() * 1.05;
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  mapRoot.add(tree);
  cyl(0.23, 0.4, 2, 0x665c42, 0, 1, 0, tree, 5);
  sphere(
    1.9 * s,
    [0x315d42, 0x3e724a, 0x547f48, 0x658b48][i % 4],
    0,
    2.8 * s,
    0,
    tree,
  );
  sphere(1.4 * s, 0x527c46, 0.6 * s, 4 * s, 0.2, tree);
  obstacles.push({ x, z, r: 0.65 });
}
for (let i = 0; i < 115; i++) {
  let x = seeded() * 88 - 44,
    z = seeded() * 72 - 36;
  if (nearLane(x, z, 4) || Math.hypot(x, z) < 8) continue;
  let s = 0.4 + seeded();
  let rock = sphere(
    s,
    [0x8a9781, 0x737f72, 0xa9af91][i % 3],
    x,
    s * 0.6,
    z,
    mapRoot,
  );
  rock.scale.set(1.5, 0.9, 1);
  rock.rotation.y = seeded() * 6;
}
for (let i = 0; i < 210; i++) {
  let x = seeded() * 90 - 45,
    z = seeded() * 74 - 37;
  if (!nearLane(x, z, 3) && Math.hypot(x, z) > 8) {
    const g = mesh(
      new THREE.ConeGeometry(0.25, 0.7, 3),
      0x91a85a,
      x,
      0.3,
      z,
      mapRoot,
    );
    g.rotation.y = seeded() * 6;
  }
}
for (const p of lanePoints.flat().filter((_, i) => i % 10 === 0)) {
  const tile = box(0.3, 0.04, 0.7, 0xd4ceaa, p.x, 0.08, p.z, mapRoot);
  tile.rotation.y = seeded() * 6;
}
const bases = [
    { x: -34, z: 25 },
    { x: 34, z: -25 },
  ],
  teamColors = [0x65d9d1, 0xf18c87];
for (let team = 0; team < 2; team++) {
  const b = bases[team];
  cyl(8, 8, 0.4, 0x687e70, b.x, 0.3, b.z, mapRoot, 20);
  cyl(6.6, 7, 0.3, 0x84978a, b.x, 0.6, b.z, mapRoot, 20);
  const ring = mesh(
    new THREE.TorusGeometry(6.4, 0.1, 4, 40),
    teamColors[team],
    b.x,
    0.81,
    b.z,
    mapRoot,
    0.5,
  );
  ring.rotation.x = Math.PI / 2;
}
const worldEntities = new THREE.Group();
scene.add(worldEntities);
/** 這一局的模擬狀態。特效、鏡頭、音訊與 UI 狀態機不在裡面。 */
const world = createWorld();
let effects = [],
  floaters = [],
  state = "select",
  selected = 0,
  toastUntil = 0,
  viewTarget = new THREE.Vector3(),
  last = performance.now(),
  muted = false,
  audioCtx = null;
const keys = new Set(),
  mouse = new THREE.Vector2(),
  aim = new THREE.Vector3(0, 0, 0),
  ray = new THREE.Raycaster(),
  ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let attackPointerId = null;
let mouseDown = false,
  pointerKnown = false,
  touchVector = { x: 0, z: 0 };
const coarse = matchMedia("(pointer:coarse)").matches;
/**
 * 副作用發射器。ringFx / burst / announce / feed / tone 只負責描述「要發生什麼」，
 * 真正的 THREE 與 DOM 操作集中在 handleEvent，每幀 drain 一次。
 * 佇列本身掛在 world 上，核心層的戰鬥邏輯也往同一條管線送。
 */
const events = world.events;
const ringFx = (x, z, r, color, life = 0.45) =>
  events.emit({ type: "ring", x, z, r, color, life });
const burst = (x, z, color, count = 10) =>
  events.emit({ type: "burst", x, z, color, count });
const damageNumber = (x, z, text, color) =>
  events.emit({ type: "damage", x, z, text, color });
const announce = (text) => events.emit({ type: "announce", text });
const feed = (text) => events.emit({ type: "feed", text });
const tone = (freq = 400, duration = 0.06, volume = 0.025, wave = "sine") =>
  events.emit({ type: "sound", freq, duration, volume, wave });

function handleEvent(event) {
  switch (event.type) {
    case "ring":
      return playRing(event.x, event.z, event.r, event.color, event.life);
    case "burst":
      return playBurst(event.x, event.z, event.color, event.count);
    case "damage":
      return showDamageNumber(event.x, event.z, event.text, event.color);
    case "playerDeath":
      mouseDown = false;
      return;
    case "matchEnd":
      return endGame(event.win);
    case "announce":
      return showAnnounce(event.text);
    case "feed":
      return showFeed(event.text);
    case "sound":
      return playTone(event.freq, event.duration, event.volume, event.wave);
  }
}

function playTone(freq, duration, volume, type) {
  if (muted || !audioCtx) return;
  const o = audioCtx.createOscillator(),
    g = audioCtx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(
    freq * 0.5,
    audioCtx.currentTime + duration,
  );
  g.gain.setValueAtTime(volume, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start();
  o.stop(audioCtx.currentTime + duration);
}
function unitModel(type, team, hero = 0) {
  const root = new THREE.Group();
  const c = team < 0 ? 0xcf7446 : teamColors[team];
  if (type === "hero") {
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
  ring.material.side = THREE.DoubleSide;
  return root;
}
/**
 * 建立單位並掛上模型。
 *
 * 數值與實體結構由核心層決定，這裡只負責補上 THREE 的部分 ——
 * 模擬層從不讀取 `model`。
 */
function addUnit(type, team, x, z, hero = 0, lane = 0) {
  const e = createUnit(world, type, team, x, z, hero, lane);
  e.model = unitModel(type, team, hero);
  e.model.position.set(x, 0, z);
  worldEntities.add(e.model);
  return e;
}
function clearBattle() {
  for (const e of [...world.entities, ...world.projectiles, ...effects])
    if (e.model) {
      scene.remove(e.model);
      worldEntities.remove(e.model);
    }
  for (const z of world.zones) scene.remove(z.model);
  world.entities = [];
  world.projectiles = [];
  effects = [];
  world.zones = [];
  floaters = [];
}
function setupBattle(hero) {
  world.movePath = [];
  events.clear();
  clearBattle();
  world.time = 0;
  world.waveAt = 1;
  world.bossAt = 180;
  world.boss = null;
  world.capture = null;
  world.scores = [0, 0];
  world.gold = 250;
  world.kills = 0;
  world.deaths = 0;
  world.evoIndex = 0;
  world.rerolls = 2;
  world.chosen = [];
  world.shopBuys = 0;
  world.ping = null;
  for (let t = 0; t < 2; t++) {
    addUnit("core", t, bases[t].x, bases[t].z);
    for (let l = 0; l < 2; l++) {
      let p = curves[l].getPoint(t === 0 ? 0.29 : 0.71);
      addUnit("tower", t, p.x, p.z, 0, l);
    }
  }
  world.player = addUnit("hero", 0, -31, 23, hero, 0);
  world.player.isPlayer = true;
  for (let i = 0; i < 2; i++)
    addUnit("hero", 0, -33 + i * 3, 20, (hero + i + 1) % 4, i);
  for (let i = 0; i < 3; i++)
    addUnit("hero", 1, 30 + i * 2, -22, (hero + i + 1) % 4, i % 2);
  viewTarget.set(world.player.x, 0, world.player.z);
  $("evolutions").innerHTML = "";
  $("feed").innerHTML = "";
  buildSkills();
  updateHud();
}
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
/** 傷害數字由呈現層自行保管生命週期，模擬只負責說「這裡跳一個數字」。 */
function showDamageNumber(x, z, text, color) {
  floaters.push({ x, z, y: 2.8, text, life: 0.8, color });
}
function showAnnounce(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  toastUntil = performance.now() + 3400;
}
function showFeed(text) {
  const d = document.createElement("div");
  d.textContent = text;
  $("feed").prepend(d);
  while ($("feed").children.length > 4) $("feed").lastChild.remove();
  setTimeout(() => d.remove(), 8000);
}
function shoot(e, dir, opts = {}) {
  const len = Math.hypot(dir.x, dir.z) || 1;
  dir = { x: dir.x / len, z: dir.z / len };
  let model = sphere(
    opts.big ? 0.34 : 0.18,
    opts.color ?? teamColors[e.team] ?? 0xefb078,
    e.x,
    1.15,
    e.z,
    scene,
  );
  world.projectiles.push({
    model,
    x: e.x,
    z: e.z,
    dx: dir.x,
    dz: dir.z,
    speed: opts.speed || 28,
    left: opts.range || e.range,
    source: e,
    damage: opts.damage || e.damage,
    pierce: opts.pierce || false,
    hit: new Set(),
    radius: opts.big ? 0.95 : 0.65,
    slow: opts.slow,
    skill: opts.skill,
    bounce: opts.bounce ?? !!e.mods.bounce,
  });
}
function direction(e) {
  if (e.isPlayer) {
    if (coarse || !pointerKnown) {
      let t = targetFor(world, e, 18);
      if (t) return { x: t.x - e.x, z: t.z - e.z };
    }
    return { x: aim.x - e.x, z: aim.z - e.z };
  }
  const t = targetFor(world, e, 18);
  return t
    ? { x: t.x - e.x, z: t.z - e.z }
    : { x: Math.sin(e.facing), z: Math.cos(e.facing) };
}
function attack(e) {
  if (e.attack > 0 || e.hp <= 0 || e.stun > 0) return;
  const d = direction(e),
    l = Math.hypot(d.x, d.z) || 1;
  d.x /= l;
  d.z /= l;
  e.facing = Math.atan2(d.x, d.z);
  e.swing = 0.18;
  e.attack =
    e.type === "hero"
      ? HEROES[e.hero].rate / (e.boost > 0 ? 1.65 : 1)
      : e.type === "minion"
        ? 1.1
        : 1.25;
  if (e.range < 6) {
    ringFx(
      e.x + d.x * 1.4,
      e.z + d.z * 1.4,
      e.range * 0.6,
      e.team < 0 ? 0xfac57c : teamColors[e.team],
      0.18,
    );
    for (const t of enemies(world, e, e.range + 1))
      if (((t.x - e.x) * d.x + (t.z - e.z) * d.z) / (dist(e, t) || 1) > -0.1)
        damage(world, t, e.damage, e);
    if (e.mods.blade)
      shoot(e, d, {
        damage: e.damage * 0.55,
        range: 10,
        pierce: true,
        color: 0x92ead2,
      });
  } else {
    shoot(e, d);
    if (e.mods.split)
      for (const a of [-0.17, 0.17])
        shoot(
          e,
          {
            x: d.x * Math.cos(a) - d.z * Math.sin(a),
            z: d.x * Math.sin(a) + d.z * Math.cos(a),
          },
          { damage: e.damage * 0.6 },
        );
  }
  if (e.isPlayer)
    tone(
      e.hero === 0 ? 220 : e.hero === 1 ? 650 : 430,
      0.045,
      0.014,
      "triangle",
    );
}
function move(e, dx, dz, dt, ignore = false) {
  let x = clamp(e.x + dx * dt, -44, 44),
    z = clamp(e.z + dz * dt, -36, 36);
  if (!ignore)
    for (const o of obstacles) {
      let d = Math.hypot(x - o.x, z - o.z);
      if (d < o.r + 0.48) {
        let a = Math.atan2(z - o.z, x - o.x);
        x = o.x + Math.cos(a) * (o.r + 0.5);
        z = o.z + Math.sin(a) * (o.r + 0.5);
      }
    }
  e.x = x;
  e.z = z;
  e.moving = Math.hypot(dx, dz) > 0.1;
}
/**
 * 障礙物在地形建好之後就不再變動，所以導航實例在這裡一次建立，
 * 格點通行表由它自己在第一次規劃時算好並快取。
 */
const navigation = createNavigation(obstacles);
const planPath = navigation.planPath;

function setMoveDestination(x, z) {
  if (state !== "playing" || world.player.hp <= 0) return;
  const destination = { x: clamp(x, -43.5, 43.5), z: clamp(z, -35.5, 35.5) };
  world.movePath = planPath(world.player, destination);
  if (world.movePath.length) {
    const end = world.movePath.at(-1);
    ringFx(end.x, end.z, 0.85, 0xf2dfa1, 0.65);
  } else announce("這個位置無法抵達，請點選附近空地。");
}
function dash(e, d, length = 6) {
  if (e.isPlayer) world.movePath = [];
  const n = Math.hypot(d.x, d.z) || 1;
  const ox = e.x,
    oz = e.z;
  move(e, (d.x / n) * length, (d.z / n) * length, 1, true);
  e.invuln = 0.22;
  ringFx(ox, oz, 1.8, teamColors[e.team], 0.3);
  if (e.mods.trail) addZone(ox, oz, 3.2, 3, e, 28, 0xf6a266, 0.2);
  if (e.mods.roll) e.boost = 3;
}
function addZone(
  x,
  z,
  r,
  life,
  e,
  dmg,
  color,
  delay = 0.7,
  slow = 0,
  stun = 0,
) {
  x = clamp(x, -44, 44);
  z = clamp(z, -36, 36);
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
  world.zones.push({
    x,
    z,
    r,
    life,
    max: life,
    source: e,
    dmg,
    delay,
    tick: delay,
    model: m,
    slow,
    stun,
  });
  ringFx(x, z, r, color, delay + 0.2);
}
function cast(e, slot) {
  if (state !== "playing" || e.hp <= 0 || e.cd[slot] > 0 || e.stun > 0) return;
  const h = HEROES[e.hero],
    d = direction(e),
    l = Math.hypot(d.x, d.z) || 1;
  d.x /= l;
  d.z /= l;
  const t =
    e.isPlayer && !coarse && pointerKnown
      ? aim
      : { x: e.x + d.x * 8, z: e.z + d.z * 8 };
  let tx = t.x,
    tz = t.z;
  if (dist(e, t) > 13) {
    tx = e.x + d.x * 13;
    tz = e.z + d.z * 13;
  }
  e.facing = Math.atan2(d.x, d.z);
  if (slot === 3) {
    dash(e, d, 5.5);
    e.cd[3] = 4.5;
    return;
  }
  e.cd[slot] = h.cd[slot] * (e.mods.haste ? 0.78 : 1);
  if (e.isPlayer) tone(slot === 2 ? 130 : 510, 0.16, 0.04, "triangle");
  if (e.hero === 0) {
    if (slot === 0) {
      const ox = e.x,
        oz = e.z;
      dash(e, d, 6);
      for (const u of enemies(world, e, 9)) {
        const ux = u.x - ox,
          uz = u.z - oz,
          along = ux * d.x + uz * d.z;
        if (along > -1 && along < 9 && Math.abs(ux * d.z - uz * d.x) < 3)
          damage(world, u, 155, e, true);
      }
      ringFx(e.x, e.z, 3.2, h.color);
    }
    if (slot === 1) {
      e.guard = 1.8;
      e.shield += 90;
      ringFx(e.x, e.z, 2.3, 0xd8efc7, 1.8);
    }
    if (slot === 2) {
      addZone(e.x, e.z, e.mods.mega ? 9 : 6, 3.2, e, 100, h.color, 0.1);
      e.guard = 1.2;
    }
  }
  if (e.hero === 1) {
    if (slot === 0) {
      shoot(e, d, {
        damage: 170,
        range: 22,
        pierce: true,
        big: true,
        skill: true,
        color: 0xffd997,
      });
      if (e.mods.fan)
        for (let a of [-0.22, 0.22])
          shoot(
            e,
            {
              x: d.x * Math.cos(a) - d.z * Math.sin(a),
              z: d.x * Math.sin(a) + d.z * Math.cos(a),
            },
            {
              damage: 120,
              range: 20,
              pierce: true,
              big: true,
              skill: true,
              color: 0xffd997,
            },
          );
    }
    if (slot === 1) {
      dash(e, { x: -d.x, z: -d.z }, 6);
      e.boost = 3;
      if (e.mods.roll)
        for (let a of [-0.2, 0, 0.2])
          shoot(e, { x: d.x + a, z: d.z }, { damage: 75, range: 15 });
    }
    if (slot === 2)
      addZone(tx, tz, e.mods.mega ? 9 : 6, 4, e, 95, 0xe9cc7d, 0.55, 0.6);
  }
  if (e.hero === 2) {
    if (slot === 0) {
      shoot(e, d, {
        damage: 135,
        range: 17,
        big: true,
        pierce: !!e.mods.fan,
        slow: 3,
        skill: true,
        color: 0x98e8ef,
      });
    }
    if (slot === 1)
      addZone(tx, tz, e.mods.mega ? 7 : 4.5, 1, e, 235, 0xfa9870, 0.7);
    if (slot === 2)
      addZone(tx, tz, e.mods.mega ? 9 : 6, 4.5, e, 100, 0xc1a1ff, 0.3, 0.8);
  }
  if (e.hero === 3) {
    if (slot === 0) {
      dash(e, d, 7);
      for (const u of enemies(world, e, 4.5)) {
        damage(world, u, 165, e, true);
        u.stun = 1.2;
        move(u, d.x * 3, d.z * 3, 1, true);
      }
      ringFx(e.x, e.z, 4.2, h.color);
    }
    if (slot === 1) {
      e.shield += 300 + (e.mods.fortress ? 200 : 0);
      addZone(e.x, e.z, 4.8, 0.4, e, 100, h.color, 0.1, 2);
    }
    if (slot === 2) {
      addZone(
        e.x,
        e.z,
        e.mods.mega ? 10 : 7,
        0.8,
        e,
        340,
        0xf9bd84,
        0.45,
        0,
        2,
      );
      e.shield += 250;
    }
  }
}

function upgradePool() {
  let a = [...heroUpgrades[world.player.hero], ...commonUpgrades];
  if (world.evoIndex === 1 || world.evoIndex === 3)
    a = [
      ...a,
      {
        id: "mega",
        name: "終極覺醒",
        desc: "大招的作用範圍大幅擴張，法師的烈焰印記也同步擴大。",
        icon: "✺",
        apply: (e) => (e.mods.mega = true),
      },
    ];
  return a.filter((u) => !world.chosen.some((c) => c.id === u.id));
}
function showUpgrade() {
  state = "upgrade";
  keys.clear();
  mouseDown = false;
  let pool = upgradePool();
  let picks = [];
  if ((world.evoIndex === 1 || world.evoIndex === 3) && pool.some((u) => u.id === "mega"))
    picks.push(
      pool.splice(
        pool.findIndex((u) => u.id === "mega"),
        1,
      )[0],
    );
  else {
    let spec = pool.filter((u) =>
      heroUpgrades[world.player.hero].some((h) => h.id === u.id),
    );
    if (spec.length) {
      let p = spec[Math.floor(Math.random() * spec.length)];
      picks.push(p);
      pool = pool.filter((x) => x !== p);
    }
  }
  while (picks.length < 3 && pool.length)
    picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal"><span class="eyebrow">EVOLUTION ${String(world.evoIndex + 1).padStart(2, "0")} / 05 · 戰場已暫停</span><h2>${world.evoIndex === 1 || world.evoIndex === 3 ? "迎接你的關鍵進化" : "選擇你的進化"}</h2><p>這場戰鬥，由你定義。選擇一項能力，保留至本局結束。</p><div class="choices">${picks.map((u, i) => `<button class="choice" data-choice="${i}"><small>${heroUpgrades[world.player.hero].some((h) => h.id === u.id) ? "英雄專屬" : u.id === "mega" ? "終極進化" : "共通祝福"}　${u.icon}</small><b>${u.name}</b><p>${u.desc}</p></button>`).join("")}</div><div class="modal-actions"><button id="reroll" ${world.rerolls <= 0 ? "disabled" : ""}>↻ 重抽選項 · 剩餘 ${world.rerolls} 次</button></div></section>`;
  document.querySelectorAll("[data-choice]").forEach(
    (b) =>
      (b.onclick = () => {
        let u = picks[+b.dataset.choice];
        u.apply(world.player);
        world.chosen.push(u);
        world.evoIndex++;
        $("evolutions").innerHTML = world.chosen
          .map((u) => `<span title="${u.desc}">${u.icon} ${u.name}</span>`)
          .join("");
        resume();
        announce(`已獲得進化：${u.name}`);
        tone(900, 0.2);
      }),
  );
  $("reroll").onclick = () => {
    if (world.rerolls > 0) {
      world.rerolls--;
      showUpgrade();
    }
  };
}
function buildSkills() {
  const h = HEROES[world.player.hero];
  $("heroBadge").textContent = h.icon;
  $("heroName").textContent = h.name;
  $("skills").innerHTML = [...h.skills, "閃避"]
    .map(
      (name, i) =>
        `<button class="skill ${i === 2 ? "ultimate" : ""}" data-skill="${i}" title="${name}（${["Q", "E", "R", "空白鍵"][i]}）"><kbd>${["Q", "E", "R", "␣"][i]}</kbd><span class="symbol">${[...h.symbols, "»"][i]}</span><small>${name}</small><span class="cool" style="display:none"></span></button>`,
    )
    .join("");
  document.querySelectorAll("[data-skill]").forEach((b) => {
    b.onpointerdown = (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      cast(world.player, +b.dataset.skill);
    };
    b.onclick = (e) => {
      if (e.detail === 0) cast(world.player, +b.dataset.skill);
    };
  });
}
function startScreen() {
  state = "select";
  selected = selected ?? 0;
  setupBattle(selected);
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<div class="start-layout"><section class="intro"><span class="eyebrow">一場戰鬥，無限種可能</span><h1>裂境</h1><div class="english">RIFTBOUND</div><p>集結你的隊伍，穿越森林戰線。<br>在隨機進化中找到專屬流派，<br>護送攻城巨獸，擊碎敵方核心。</p><div class="match-meta"><div><b>3 vs 3</b>你與 AI 隊友</div><div><b>8–12 min</b>一場冒險</div><div><b>5 次</b>隨機進化</div></div></section><section class="hero-select"><div class="select-title"><h2>選擇你的英雄</h2><span>四位英雄 · 自由選擇</span></div><div class="hero-grid">${HEROES.map((h, i) => `<button class="hero-card ${selected === i ? "selected" : ""}" data-hero="${i}"><span class="icon">${h.icon}</span><b>${h.name}</b><small>${h.role}</small><span class="check">${selected === i ? "✓" : ""}</span></button>`).join("")}</div><div id="heroDetail" class="hero-detail">${HEROES[selected].desc}</div><button id="start" class="primary">進入戰場　→</button><p class="start-help">${coarse ? "左側搖桿移動 · 點擊技能與普攻 · 自動瞄準附近敵人" : "右鍵 / WASD 移動 · 左鍵普攻 · 面向滑鼠"}</p></section></div>`;
  document.querySelectorAll("[data-hero]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = +b.dataset.hero;
        document.querySelectorAll("[data-hero]").forEach((c) => {
          c.classList.toggle("selected", c === b);
          c.querySelector(".check").textContent = c === b ? "✓" : "";
        });
        $("heroDetail").textContent = HEROES[selected].desc;
      }),
  );
  $("start").onclick = () => startGame(selected);
}
function startGame(h) {
  if (!Number.isInteger(h) || h < 0 || h > 3)
    throw new Error("請選擇 0 到 3 的英雄");
  if (state !== "select" && state !== "ended")
    throw new Error("請先結束目前戰局");
  setupBattle(h);
  state = "playing";
  $("overlay").classList.add("hidden");
  if (!audioCtx)
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {}
  audioCtx?.resume();
  announce("戰鬥開始！右鍵或 WASD 移動，左鍵普通攻擊。");
  return { hero: HEROES[h].name, state };
}
function resume() {
  world.movePath = [];
  state = "playing";
  $("overlay").classList.add("hidden");
  mouseDown = false;
  keys.clear();
}
function pauseGame() {
  if (state === "paused") {
    resume();
    return;
  }
  if (state !== "playing") return;
  state = "paused";
  world.movePath = [];
  keys.clear();
  mouseDown = false;
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal pause-box"><span class="eyebrow">TAKE A BREATH</span><h2>戰場已暫停</h2><div class="instructions">右鍵點地　移動至指定位置<br>WASD　手動移動，取消點地路徑<br>角色持續面向滑鼠方向<br>左鍵　普攻（按住可連續攻擊）<br>Q / E　技能　 R　大招<br>空白鍵　閃避　 G　呼叫隊友<br>B　基地裝備　 Esc　暫停<br><br>先推倒任一路防禦塔，再攻擊核心。<br>每 60 / 150 / 240 / 330 / 420 秒進化。<br>靠近己方核心可快速恢復生命。</div><button id="resume" class="primary">繼續戰鬥</button><button id="quit" class="secondary">離開本局，重新選角</button></section>`;
  $("resume").onclick = resume;
  $("quit").onclick = startScreen;
}
function showShop() {
  if (state !== "playing") return;
  if (world.player.hp <= 0 || dist(world.player, bases[0]) > 10) {
    announce("請返回己方核心附近購買裝備。");
    return;
  }
  state = "shop";
  mouseDown = false;
  keys.clear();
  const cost = 180 + world.shopBuys * 100;
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal"><span class="eyebrow">基地補給 · 戰場已暫停</span><h2>準備下一波進攻</h2><p>金幣 ◈ ${Math.floor(world.gold)}　·　每次購買後，下一件裝備價格提高。</p><div class="choices">${[
      { name: "鋒銳徽章", desc: "所有傷害增加 12%。", icon: "⚔" },
      { name: "守護護符", desc: "最大生命增加 220，恢復生命。", icon: "♡" },
      { name: "疾行長靴", desc: "移動速度增加 8%。", icon: "»" },
    ]
      .map(
        (u, i) =>
          `<button class="choice" data-buy="${i}" ${world.gold < cost ? "disabled" : ""}><small>${u.icon}　◈ ${cost}</small><b>${u.name}</b><p>${u.desc}</p></button>`,
      )
      .join(
        "",
      )}</div><div class="modal-actions"><button id="closeShop">返回戰場</button></div></section>`;
  document.querySelectorAll("[data-buy]").forEach(
    (b) =>
      (b.onclick = () => {
        if (world.gold < cost) return;
        world.gold -= cost;
        world.shopBuys++;
        if (+b.dataset.buy === 0)
          world.player.mods.power = (world.player.mods.power || 0) + 0.12;
        if (+b.dataset.buy === 1) {
          world.player.maxHp += 220;
          world.player.hp = Math.min(world.player.maxHp, world.player.hp + 400);
        }
        if (+b.dataset.buy === 2) world.player.speed *= 1.08;
        resume();
        announce("裝備已生效！");
        updateHud();
      }),
  );
  $("closeShop").onclick = resume;
}
function endGame(win) {
  if (state === "ended") return;
  state = "ended";
  mouseDown = false;
  keys.clear();
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    `<section class="modal pause-box"><span class="eyebrow">${win ? "VICTORY" : "DEFEAT"} · ${clock(world.time)}</span><h2>${win ? "勝利，核心已擊碎！" : "這次，先讓對手一局。"}</h2><p>擊敗 ${world.kills} 位英雄 · 陣亡 ${world.deaths} 次<br>獲得 ${world.chosen.length} 項進化，下局試試另一種組合。</p><div class="instructions">${world.chosen.length ? world.chosen.map((u) => u.icon + " " + u.name).join("<br>") : "新的流派，等你探索。"}</div><button id="again" class="primary">再來一局 · 重新選角</button></section>`;
  $("again").onclick = startScreen;
}
function command(x = aim.x, z = aim.z) {
  if (state !== "playing") return;
  world.ping = { x: clamp(x, -43, 43), z: clamp(z, -35, 35), until: world.time + 13 };
  ringFx(world.ping.x, world.ping.z, 4, 0xf0d795, 1.5);
  announce("已呼叫隊友集合，指令持續 13 秒。");
  tone(800, 0.1);
}
function spawnWave() {
  for (let team = 0; team < 2; team++)
    for (let lane = 0; lane < 2; lane++)
      for (let i = 0; i < 3; i++) {
        const p = curves[lane].getPoint(team === 0 ? i * 0.008 : 1 - i * 0.008);
        const u = addUnit(
          "minion",
          team,
          p.x + rand(-0.5, 0.5),
          p.z + rand(-0.5, 0.5),
          0,
          lane,
        );
        u.progress = team === 0 ? i * 0.008 : 1 - i * 0.008;
      }
}
function nearestProgress(e) {
  let best = Infinity,
    t = 0;
  lanePoints[e.lane].forEach((p, i) => {
    const d = dist(e, p);
    if (d < best) {
      best = d;
      t = i / 160;
    }
  });
  return t;
}
function ai(e, dt) {
  if (e.stun > 0) return;
  let target = targetFor(world, e, e.type === "hero" ? 18 : e.range + 0.8);
  let dest = null,
    speed = e.speed * (e.slow > 0 ? 0.5 : 1);
  if (e.type === "tower" || e.type === "core") {
    if (target && dist(e, target) <= e.range) {
      if (e.attack <= 0) {
        e.attack = e.type === "tower" ? 1.15 : 1.5;
        shoot(
          e,
          { x: target.x - e.x, z: target.z - e.z },
          { range: e.range + 2, damage: e.damage, speed: 24, big: true },
        );
      }
    }
    return;
  }
  if (e.type === "boss" && e.team < 0) {
    if (target && dist(e, { x: 0, z: 0 }) < 7) {
      dest = target;
      if (dist(e, target) < 5 && e.attack <= 0) {
        e.attack = 2.5;
        addZone(e.x, e.z, 5, 0.9, e, 160, 0xf79c65, 0.65);
      }
    } else dest = { x: 0, z: 0 };
  } else if (e.type === "hero") {
    if (e.hp < e.maxHp * 0.24) {
      dest = bases[e.team];
      target = null;
    } else if (dist(e, bases[e.team]) < 8 && e.hp < e.maxHp * 0.8) {
      dest = bases[e.team];
      target = null;
    } else if (e.team === 0 && world.ping && world.ping.until > world.time) {
      dest = world.ping;
      if (target && dist(e, target) < e.range) dest = null;
    } else if (world.capture && world.capture.team === e.team) {
      dest = { x: 0, z: 0 };
    } else if (
      world.boss?.hp > 0 &&
      world.boss.team === -1 &&
      (world.time % 180 > 5 || dist(e, world.boss) < 17)
    ) {
      dest = world.boss;
      if (dist(e, world.boss) < e.range + 1) target = world.boss;
    } else if (world.boss?.hp > 0 && world.boss.team === e.team && dist(e, world.boss) < 27) {
      dest = world.boss;
    } else if (target && dist(e, target) < 14) {
      dest = target;
    } else {
      e.progress = nearestProgress(e);
      dest = curves[e.lane].getPoint(
        clamp(e.progress + (e.team === 0 ? 0.04 : -0.04), 0, 1),
      );
    }
    if (target && dist(e, target) <= e.range + 1) {
      let d = { x: target.x - e.x, z: target.z - e.z };
      e.facing = Math.atan2(d.x, d.z);
      if (e.attack <= 0) {
        if (e.range > 6) {
          e.attack = HEROES[e.hero].rate;
          shoot(e, d);
        } else attack(e);
      }
      if (
        target.type === "hero" ||
        target.type === "boss" ||
        enemies(world, e, 8).length > 2
      ) {
        if (e.cd[0] <= 0) cast(e, 0);
        if (e.cd[1] <= 0 && (e.hero === 2 || e.hp < e.maxHp * 0.8)) cast(e, 1);
        if (e.cd[2] <= 0 && world.time > 22) cast(e, 2);
      }
      if (e.range > 6 && dist(e, target) < 5) {
        dest = { x: e.x - d.x, z: e.z - d.z };
      } else if (e.range > 6 && dist(e, target) < e.range * 0.85)
        dest = {
          x: e.x + Math.sin(world.time + e.id) * 2,
          z: e.z + Math.cos(world.time * 0.7 + e.id) * 2,
        };
      else dest = null;
    }
  } else if (e.type === "minion") {
    if (target) {
      dest = target;
      if (dist(e, target) <= e.range) {
        e.facing = Math.atan2(target.x - e.x, target.z - e.z);
        attack(e);
        dest = null;
      }
    } else {
      e.progress = nearestProgress(e);
      dest = curves[e.lane].getPoint(
        clamp(e.progress + (e.team === 0 ? 0.022 : -0.022), 0, 1),
      );
    }
  } else if (e.type === "boss") {
    target = world.entities
      .filter(
        (u) =>
          u.hp > 0 &&
          u.team === 1 - e.team &&
          ((u.type === "tower" && u.lane === e.lane) || u.type === "core"),
      )
      .sort((a, b) => dist(e, a) - dist(e, b))[0];
    if (target) {
      if (dist(e, target) < 6) {
        dest = null;
        if (e.attack <= 0) {
          e.attack = 2.4;
          const escort = world.entities.some(
            (u) =>
              u.type === "hero" &&
              u.hp > 0 &&
              u.team === e.team &&
              dist(e, u) < 10,
          );
          damage(world, target, escort ? 440 : 160, e, true);
          ringFx(e.x, e.z, 6, 0xffc78a);
          tone(100, 0.2);
        }
      } else {
        e.progress = nearestProgress(e);
        dest = curves[e.lane].getPoint(
          clamp(e.progress + (e.team === 0 ? 0.035 : -0.035), 0, 1),
        );
        if (dist(e, curves[e.lane].getPoint(e.progress)) > 5)
          dest = curves[e.lane].getPoint(e.progress);
      }
    }
  }
  if (dest) {
    const dx = dest.x - e.x,
      dz = dest.z - e.z,
      d = Math.hypot(dx, dz);
    if (d > 1) {
      move(e, (dx / d) * speed, (dz / d) * speed, dt, e.type !== "hero");
      e.facing = Math.atan2(dx, dz);
    } else e.moving = false;
  } else e.moving = false;
}
function claimBoss(team, lane) {
  if (!world.boss) return;
  world.boss.hp = world.boss.maxHp = 2700;
  world.boss.team = team;
  world.boss.lane = lane;
  world.boss.facing = team === 0 ? 1 : -2;
  world.boss.progress = nearestProgress(world.boss);
  world.capture = null;
  ringFx(0, 0, 8, teamColors[team], 2);
  announce(`${team === 0 ? "我方" : "敵方"}收服熔岩龜！護送牠可強化攻城衝撞。`);
  feed(
    `${team === 0 ? "我方" : "敵方"}的熔岩龜前往${lane === 0 ? "上" : "下"}路`,
  );
}
function routeChoice() {
  state = "route";
  mouseDown = false;
  keys.clear();
  $("overlay").classList.remove("hidden");
  $("overlay").innerHTML =
    '<section class="modal pause-box"><span class="eyebrow">巨獸已收服 · 戰場已暫停</span><h2>讓熔岩龜往哪裡進攻？</h2><p>跟在牠附近，衝撞防禦塔的傷害會大幅提升。</p><button class="primary" id="route0">上路進攻 ↖</button><button class="secondary" id="route1">下路進攻 ↗</button></section>';
  $("route0").onclick = () => {
    claimBoss(0, 0);
    resume();
  };
  $("route1").onclick = () => {
    claimBoss(0, 1);
    resume();
  };
}
function update(dt) {
  if (state !== "playing") return;
  world.time += dt;
  world.gold += dt * 1.6;
  if (world.time >= world.waveAt) {
    spawnWave();
    world.waveAt = world.time + 19;
  }
  if (!world.boss && !world.capture && world.time >= world.bossAt) {
    world.boss = addUnit("boss", -1, 0, 0);
    announce("熔岩龜甦醒！前往中央爭奪攻城巨獸。");
    tone(160, 0.4);
  }
  if (world.capture) {
    let blue = world.entities.some(
        (e) =>
          e.type === "hero" &&
          e.hp > 0 &&
          e.team === 0 &&
          dist(e, { x: 0, z: 0 }) < 8,
      ),
      red = world.entities.some(
        (e) =>
          e.type === "hero" &&
          e.hp > 0 &&
          e.team === 1 &&
          dist(e, { x: 0, z: 0 }) < 8,
      );
    if (blue && !red) {
      if (world.capture.team !== 0) {
        world.capture.team = 0;
        world.capture.value = 0;
      }
      world.capture.value += dt;
    } else if (red && !blue) {
      if (world.capture.team !== 1) {
        world.capture.team = 1;
        world.capture.value = 0;
      }
      world.capture.value += dt;
    }
    if (world.capture.value >= 5) {
      if (world.capture.team === 0) routeChoice();
      else
        claimBoss(
          1,
          world.entities
            .filter((e) => e.type === "tower" && e.team === 0 && e.hp > 0)
            .sort((a, b) => a.hp - b.hp)[0]?.lane ?? 0,
        );
    }
  }
  if (world.evoIndex < 5 && world.time >= [60, 150, 240, 330, 420][world.evoIndex]) {
    showUpgrade();
    return;
  }
  if (world.time > 600) {
    world.entities
      .filter((e) => e.type === "core" && e.hp > 0)
      .forEach((e) => {
        if (state === "playing")
          damage(world, e, dt * (15 + (world.time - 600) * 0.25), null);
      });
    $("phase").textContent = "核心衰減";
  }
  for (const e of world.entities) {
    if (e.hp <= 0) {
      if (e.type === "hero") {
        e.dead -= dt;
        if (e.dead <= 0) {
          e.hp = e.maxHp;
          e.x = bases[e.team].x + (e.team === 0 ? 3 : -3);
          e.z = bases[e.team].z;
          e.shield = 0;
          e.cd = [0, 0, 0, 0];
          e.invuln = 2;
          if (e.isPlayer) announce("重返戰場！");
        }
      }
      continue;
    }
    e.attack -= dt;
    e.cd = e.cd.map((c) => Math.max(0, c - dt));
    e.guard = Math.max(0, e.guard - dt);
    e.slow = Math.max(0, e.slow - dt);
    e.stun = Math.max(0, e.stun - dt);
    e.boost = Math.max(0, e.boost - dt);
    e.invuln = Math.max(0, (e.invuln || 0) - dt);
    e.hit = Math.max(0, (e.hit || 0) - dt);
    e.swing = Math.max(0, (e.swing || 0) - dt);
    if (e.type === "hero") {
      if (e.xp >= e.level * 100 && e.level < 12) {
        e.xp -= e.level * 100;
        e.level++;
        e.maxHp += 70;
        e.hp = Math.min(e.maxHp, e.hp + 150);
        e.damage += 5;
        if (e.isPlayer) {
          announce(`升至 LV. ${e.level}！生命與攻擊提升。`);
          ringFx(e.x, e.z, 3, 0xe2d58e);
        }
      }
      if (dist(e, bases[e.team]) < 8)
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.18 * dt);
      else e.hp = Math.min(e.maxHp, e.hp + 1.8 * dt);
      if (!e.isPlayer) e.xp += dt * 1.4;
    }
    if (e.isPlayer) {
      if (e.stun <= 0) {
        const speed = e.speed * (e.slow > 0 ? 0.5 : 1),
          manualX =
            (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0) + touchVector.x,
          manualZ =
            (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0) + touchVector.z,
          manualLength = Math.hypot(manualX, manualZ),
          manualActive =
            ["w", "a", "s", "d"].some((k) => keys.has(k)) ||
            Math.hypot(touchVector.x, touchVector.z) > 0;
        e.moving = false;
        if (manualActive) {
          world.movePath = [];
          if (manualLength > 0)
            move(
              e,
              (manualX / Math.max(1, manualLength)) * speed,
              (manualZ / Math.max(1, manualLength)) * speed,
              dt,
            );
        } else if (world.movePath.length) {
          const dest = world.movePath[0],
            dx = dest.x - e.x,
            dz = dest.z - e.z,
            d = Math.hypot(dx, dz);
          if (d < 0.18) world.movePath.shift();
          else {
            const step = Math.min(speed, d / dt);
            move(e, (dx / d) * step, (dz / d) * step, dt);
            if (dist(e, dest) < 0.18) world.movePath.shift();
          }
        }
        const dir = direction(e);
        if (Math.hypot(dir.x, dir.z) > 0.03)
          e.facing = Math.atan2(dir.x, dir.z);
        if (mouseDown) attack(e);
      }
    } else ai(e, dt);
  }
  for (const p of world.projectiles) {
    let step = p.speed * dt;
    let ox = p.x,
      oz = p.z;
    p.x += p.dx * step;
    p.z += p.dz * step;
    p.left -= step;
    p.model.position.set(p.x, 1.1, p.z);
    for (const t of world.entities) {
      if (
        t.hp <= 0 ||
        t.team === p.source.team ||
        p.hit.has(t.id) ||
        t === p.source
      )
        continue;
      let a = clamp(((t.x - ox) * p.dx + (t.z - oz) * p.dz) / step, 0, 1),
        dd = Math.hypot(
          t.x - (ox + (p.x - ox) * a),
          t.z - (oz + (p.z - oz) * a),
        );
      if (
        dd <
        (t.type === "boss"
          ? 2.5
          : t.type === "tower" || t.type === "core"
            ? 1.5
            : 0.6) +
          p.radius
      ) {
        damage(world, t, p.damage, p.source, p.skill);
        if (p.slow) t.slow = p.slow;
        p.hit.add(t.id);
        burst(t.x, t.z, p.source.team === 0 ? 0xa8e6d9 : 0xf7b493, 3);
        if (p.bounce) {
          const next = world.entities
            .filter(
              (e) =>
                e.hp > 0 &&
                e.team !== p.source.team &&
                !p.hit.has(e.id) &&
                e !== p.source &&
                dist(e, t) < 7,
            )
            .sort((a, b) => dist(a, t) - dist(b, t))[0];
          if (next) {
            let d = dist(t, next);
            p.x = t.x;
            p.z = t.z;
            p.dx = (next.x - t.x) / d;
            p.dz = (next.z - t.z) / d;
            p.left = 8;
            p.bounce = false;
            break;
          }
        }
        if (!p.pierce) {
          p.left = -1;
          break;
        }
      }
    }
  }
  world.projectiles = world.projectiles.filter((p) => {
    if (p.left <= 0) {
      scene.remove(p.model);
      p.model.geometry.dispose();
      return false;
    }
    return true;
  });
  for (const z of world.zones) {
    z.life -= dt;
    z.tick -= dt;
    z.model.material.opacity = z.tick > 0 ? 0.12 : 0.35;
    if (z.tick <= 0) {
      z.tick = 0.65;
      ringFx(z.x, z.z, z.r, z.source.team === 0 ? 0xb4dfdb : 0xf9a47e, 0.35);
      for (const e of world.entities)
        if (e.hp > 0 && e.team !== z.source.team && dist(e, z) < z.r) {
          damage(world, e, z.dmg, z.source, true);
          e.slow = Math.max(e.slow, z.slow);
          e.stun = Math.max(e.stun, z.stun);
        }
    }
  }
  world.zones = world.zones.filter((z) => {
    if (z.life <= 0) {
      scene.remove(z.model);
      z.model.geometry.dispose();
      z.model.material.dispose();
      return false;
    }
    return true;
  });
  for (const e of world.entities) {
    if (e.hp > 0 && e.mods.thorns) {
      if (e.hadShield && e.shield <= 0) {
        for (const t of enemies(world, e, 5)) damage(world, t, 160, e, true);
        ringFx(e.x, e.z, 5, 0xe9bb83);
      }
      e.hadShield = e.shield > 0;
    }
  }
  world.entities = world.entities.filter((e) => {
    if (e.hp <= 0 && e.type === "minion") {
      worldEntities.remove(e.model);
      e.model.traverse((o) => o.geometry?.dispose());
      return false;
    }
    return true;
  });
  syncModels(dt);
  if (state !== "playing") return;
  updateHud();
}
/**
 * 模擬 → 場景的單向同步。
 *
 * 模擬層只寫純數值（x / z / facing / hp / hit），模型的位置、旋轉與可見性
 * 一律在這裡推導。這道單向性是把遊戲邏輯與 THREE 分開的前提：邏輯不再需要
 * 持有 Object3D，也就能在沒有 WebGL 的環境裡執行與測試。
 */
function syncModels(dt) {
  for (const e of world.entities) {
    e.model.visible = e.hp > 0;
    if (e.hp <= 0) continue;
    const bob =
      (e.type === "hero" || e.type === "minion") && e.moving
        ? Math.abs(Math.sin(world.time * 14 + e.id)) * 0.13
        : 0;
    e.model.position.set(e.x, bob, e.z);
    e.model.rotation.y = e.facing;
    e.model.scale.setScalar(e.hit > 0 ? 1.045 : 1);
    const crystal = e.model.userData.crystal;
    if (crystal) {
      crystal.rotation.y = world.time * 0.6;
      crystal.position.y +=
        (Math.sin(world.time * 2) - Math.sin((world.time - dt) * 2)) * 0.12;
    }
  }
}
function updateHud() {
  if (!world.player) return;
  $("score").innerHTML =
    `<b class="blue">${world.scores[0]}</b><span>VS</span><b class="red">${world.scores[1]}</b><i></i><time>${clock(world.time)}</time>`;
  $("level").textContent = `LV. ${world.player.level}`;
  $("healthFill").style.width =
    clamp((world.player.hp / world.player.maxHp) * 100, 0, 100) + "%";
  $("healthText").textContent =
    `${Math.ceil(Math.max(0, world.player.hp))} / ${world.player.maxHp}${world.player.shield > 0 ? " ＋" + Math.ceil(world.player.shield) : ""}`;
  $("gold").textContent = "◈ " + Math.floor(world.gold);
  document.querySelectorAll("[data-skill]").forEach((b, i) => {
    const c = b.querySelector(".cool");
    c.style.display = world.player.cd[i] > 0.05 ? "grid" : "none";
    c.textContent = Math.ceil(world.player.cd[i]);
  });
  $("bossTitle").textContent = world.capture
    ? "巢穴收服中"
    : world.boss?.hp > 0
      ? world.boss.team < 0
        ? "熔岩龜已甦醒"
        : world.boss.team === 0
          ? "護送我方熔岩龜"
          : "攔截敵方熔岩龜"
      : "熔岩龜甦醒";
  $("bossTime").textContent = world.capture
    ? `${world.capture.team === 0 ? "我方" : "敵方"} ${Math.min(100, Math.floor((world.capture.value / 5) * 100))}%`
    : world.boss?.hp > 0
      ? world.boss.team < 0
        ? "中央巢穴 · 爭奪中"
        : `生命 ${Math.ceil(world.boss.hp)} / ${world.boss.maxHp}`
      : clock(Math.max(0, world.bossAt - world.time));
  $("respawn").innerHTML =
    world.player.hp <= 0
      ? `重返戰場<br><b style="font-size:48px">${Math.ceil(Math.max(0, world.player.dead))}</b>`
      : "";
}
const ctx = $("labels").getContext("2d"),
  mapctx = $("minimap").getContext("2d");
let W = innerWidth,
  H = innerHeight;
const proj = new THREE.Vector3();
function resize() {
  W = innerWidth;
  H = innerHeight;
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  $("labels").width = W * devicePixelRatio;
  $("labels").height = H * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resize);
resize();
function screen(x, y, z) {
  proj.set(x, y, z).project(camera);
  return {
    x: ((proj.x + 1) * W) / 2,
    y: ((1 - proj.y) * H) / 2,
    visible: proj.z < 1 && proj.z > -1,
  };
}
function drawLabels() {
  ctx.clearRect(0, 0, W, H);
  if (state === "select") return;
  for (const e of world.entities) {
    if (e.hp <= 0) continue;
    const p = screen(
      e.x,
      e.type === "core"
        ? 6
        : e.type === "tower"
          ? 5.4
          : e.type === "boss"
            ? 4.2
            : 3.1,
      e.z,
    );
    if (!p.visible || p.x < -100 || p.x > W + 100 || p.y < 65 || p.y > H + 20)
      continue;
    let w = e.type === "minion" ? 25 : e.type === "hero" ? 55 : 76;
    ctx.fillStyle = "#0a1e24dc";
    ctx.fillRect(p.x - w / 2 - 1, p.y - 1, w + 2, 7);
    ctx.fillStyle =
      e.team < 0 ? "#edb66e" : e.team === 0 ? "#7ce1d1" : "#ee9390";
    ctx.fillRect(p.x - w / 2, p.y, w * clamp(e.hp / e.maxHp, 0, 1), 5);
    if (e.shield > 0) {
      ctx.fillStyle = "#f1e4b6";
      ctx.fillRect(
        p.x - w / 2,
        p.y + 6,
        w * clamp(e.shield / e.maxHp, 0, 1),
        2,
      );
    }
    if (e.type !== "minion") {
      ctx.font = `${e.isPlayer ? "bold " : ""}11px 'Noto Sans TC',sans-serif`;
      ctx.textAlign = "center";
      ctx.shadowColor = "#07201b";
      ctx.shadowBlur = 5;
      ctx.fillStyle = e.isPlayer ? "#fff7c7" : "#f1f4e6";
      ctx.fillText(
        e.type === "hero"
          ? `${e.isPlayer ? "▼ 你" : HEROES[e.hero].name}  ${e.level}`
          : e.type === "core"
            ? "核心"
            : e.type === "boss"
              ? e.team < 0
                ? "熔岩龜 · 中立巨獸"
                : "攻城熔岩龜"
              : "防禦塔",
        p.x,
        p.y - 6,
      );
      ctx.shadowBlur = 0;
      if (e.slow > 0 || e.stun > 0) {
        ctx.fillStyle = "#bdefff";
        ctx.fillText(e.stun > 0 ? "暈眩" : "緩速", p.x, p.y - 23);
      }
    }
  }
  for (const f of floaters) {
    const p = screen(f.x, f.y + (1 - f.life) * 2, f.z);
    ctx.globalAlpha = clamp(f.life * 2, 0, 1);
    ctx.font = "bold 17px Space Grotesk,sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = f.color;
    ctx.strokeStyle = "#24352a";
    ctx.lineWidth = 2;
    ctx.strokeText(f.text, p.x, p.y);
    ctx.fillText(f.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  if (world.ping && world.time < world.ping.until) {
    const p = screen(world.ping.x, 0.4, world.ping.z);
    ctx.strokeStyle = "#ffe2a2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13 + Math.sin(world.time * 5) * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#ffe2a2";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("集合", p.x, p.y - 22);
  }
}
function drawMap() {
  const c = mapctx,
    mx = (x) => ((x + 47) / 94) * 210,
    mz = (z) => ((z + 40) / 80) * 168;
  c.fillStyle = "#243e35";
  c.fillRect(0, 0, 210, 168);
  c.strokeStyle = "#477f76";
  c.lineWidth = 10;
  c.beginPath();
  river.forEach((p, i) =>
    i ? c.lineTo(mx(p.x), mz(p.z)) : c.moveTo(mx(p.x), mz(p.z)),
  );
  c.stroke();
  c.lineWidth = 6;
  c.strokeStyle = "#9da780";
  for (const ps of lanePoints) {
    c.beginPath();
    ps.forEach((p, i) =>
      i ? c.lineTo(mx(p.x), mz(p.z)) : c.moveTo(mx(p.x), mz(p.z)),
    );
    c.stroke();
  }
  c.strokeStyle = "#d2b777";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(mx(0), mz(0), 12, 0, Math.PI * 2);
  c.stroke();
  for (const e of world.entities) {
    if (e.hp <= 0) continue;
    c.fillStyle = e.isPlayer
      ? "#fff2b6"
      : e.team === 0
        ? "#72dddc"
        : e.team === 1
          ? "#f98c91"
          : "#ffc477";
    let r =
      e.type === "minion"
        ? 1.5
        : e.type === "hero"
          ? 3.2
          : e.type === "boss"
            ? 5
            : 4;
    if (e.type === "tower" || e.type === "core") {
      c.fillRect(mx(e.x) - r, mz(e.z) - r, r * 2, r * 2);
    } else {
      c.beginPath();
      c.arc(mx(e.x), mz(e.z), r, 0, Math.PI * 2);
      c.fill();
    }
    if (e.isPlayer) {
      c.strokeStyle = "#fffbdc";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(mx(e.x), mz(e.z), 5.5, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (world.player && state !== "select") {
    c.strokeStyle = "#e4ead480";
    c.lineWidth = 1;
    c.strokeRect(mx(world.player.x) - 29, mz(world.player.z) - 22, 58, 44);
  }
  if (world.ping && world.time < world.ping.until) {
    c.strokeStyle = "#ffe2a2";
    c.beginPath();
    c.arc(mx(world.ping.x), mz(world.ping.z), 6 + Math.sin(world.time * 5) * 2, 0, Math.PI * 2);
    c.stroke();
  }
}
const aimRing = new THREE.Mesh(
  new THREE.RingGeometry(0.4, 0.49, 24),
  new THREE.MeshBasicMaterial({
    color: 0xf2dfa1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  }),
);
aimRing.rotation.x = -Math.PI / 2;
scene.add(aimRing);
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.045);
  last = now;
  if (state === "playing") {
    ray.setFromCamera(mouse, camera);
    ray.ray.intersectPlane(ground, aim);
    update(dt);
  }
  // 輸入處理與 UI 也會發事件，所以不論處於哪個狀態都要取用。
  events.drain(handleEvent);
  if (state === "select") {
    viewTarget.lerp(new THREE.Vector3(0, 0, 0), 0.04);
    camera.position.lerp(new THREE.Vector3(4, 68, 57), 0.035);
    camera.lookAt(viewTarget);
  } else if (world.player) {
    viewTarget.lerp(
      new THREE.Vector3(world.player.x, 0, world.player.z),
      1 - Math.exp(-dt * 7),
    );
    camera.position.set(viewTarget.x, 35, viewTarget.z + 29);
    camera.lookAt(viewTarget.x, 0, viewTarget.z - 3);
  }
  aimRing.visible =
    state === "playing" && pointerKnown && !coarse && world.player?.hp > 0;
  aimRing.position.set(aim.x, 0.17, aim.z);
  for (const e of effects) {
    if (state === "playing" || state === "ended") {
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
  if (state === "playing") floaters.forEach((f) => (f.life -= dt));
  floaters = floaters.filter((f) => f.life > 0);
  if (performance.now() > toastUntil) $("toast").classList.remove("show");
  renderer.render(scene, camera);
  drawLabels();
  drawMap();
}
function pointerAim(e) {
  mouse.set((e.clientX / W) * 2 - 1, (-e.clientY / H) * 2 + 1);
  pointerKnown = true;
  camera.updateMatrixWorld();
  ray.setFromCamera(mouse, camera);
  ray.ray.intersectPlane(ground, aim);
}
window.addEventListener("pointermove", pointerAim);
$("world").addEventListener("pointerdown", (e) => {
  if (state !== "playing" || world.player.hp <= 0) return;
  pointerAim(e);
  if (e.button === 2) {
    e.preventDefault();
    setMoveDestination(aim.x, aim.z);
  } else if (e.button === 0) {
    attackPointerId = e.pointerId;
    mouseDown = true;
    attack(world.player);
    audioCtx?.resume();
  }
});
function releaseAttackPointer(e) {
  if (e.pointerId === attackPointerId) {
    attackPointerId = null;
    mouseDown = false;
  }
}
window.addEventListener("pointerup", releaseAttackPointer);
window.addEventListener("pointercancel", releaseAttackPointer);
$("world").addEventListener("contextmenu", (e) => e.preventDefault());
window.addEventListener("keydown", (e) => {
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key))
    e.preventDefault();
  if (e.repeat) return;
  const k = e.key.toLowerCase();
  if (k === "escape") {
    if (state === "shop") resume();
    else pauseGame();
    return;
  }
  if (state !== "playing") return;
  keys.add(k);
  if (["w", "a", "s", "d"].includes(k)) world.movePath = [];
  if (k === "q") cast(world.player, 0);
  if (k === "e") cast(world.player, 1);
  if (k === "r") cast(world.player, 2);
  if (k === " ") cast(world.player, 3);
  if (k === "g") command();
  if (k === "b") showShop();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  mouseDown = false;
  touchVector = { x: 0, z: 0 };
  if (state === "playing") pauseGame();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state === "playing") pauseGame();
});
$("pause").onclick = pauseGame;
$("sound").onclick = () => {
  muted = !muted;
  $("sound").textContent = muted ? "♫ 靜音" : "♫ 音效";
  if (!muted) audioCtx?.resume();
};
$("shopButton").onclick = showShop;
$("minimap").onclick = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  command(
    ((e.clientX - r.left) / r.width) * 94 - 47,
    ((e.clientY - r.top) / r.height) * 80 - 40,
  );
};
let touchId = null;
const joystick = $("touchMove");
function joy(e) {
  const r = joystick.getBoundingClientRect();
  let x = clamp((e.clientX - r.left - r.width / 2) / 36, -1, 1),
    z = clamp((e.clientY - r.top - r.height / 2) / 36, -1, 1);
  touchVector = { x, z };
  joystick.firstChild.style.transform = `translate(${x * 29}px,${z * 29}px)`;
}
joystick.addEventListener("pointerdown", (e) => {
  if (touchId !== null) return;
  e.preventDefault();
  touchId = e.pointerId;
  joystick.setPointerCapture(e.pointerId);
  joy(e);
});
joystick.addEventListener("pointermove", (e) => {
  if (e.pointerId === touchId) joy(e);
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  joystick.addEventListener(event, (e) => {
    if (e.pointerId !== touchId) return;
    touchId = null;
    touchVector = { x: 0, z: 0 };
    joystick.firstChild.style.transform = "none";
  });
$("touchAttack").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (state !== "playing" || world.player.hp <= 0) return;
  attackPointerId = e.pointerId;
  e.currentTarget.setPointerCapture(e.pointerId);
  mouseDown = true;
  attack(world.player);
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  $("touchAttack").addEventListener(event, releaseAttackPointer);

startScreen();
requestAnimationFrame(frame);
if (document.modelContext?.registerTool) {
  const life = new AbortController();
  const tools = [
    {
      name: "read_match_state",
      title: "查看裂境戰局",
      description:
        "Read the current match state, hero, score, evolution and boss status.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => ({
        state,
        seconds: Math.floor(world.time),
        hero: world.player ? HEROES[world.player.hero].name : null,
        health: world.player ? Math.ceil(world.player.hp) : null,
        score: world.scores,
        evolutions: world.chosen.map((u) => u.name),
        boss: world.boss ? { team: world.boss.team, health: world.boss.hp } : null,
      }),
    },
    {
      name: "start_match",
      title: "開始裂境戰鬥",
      description:
        "Start a new match from the hero selection screen. Hero 0 swordsman, 1 archer, 2 mage, 3 fighter.",
      inputSchema: {
        type: "object",
        properties: { hero: { type: "integer", minimum: 0, maximum: 3 } },
        required: ["hero"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => startGame(input?.hero),
    },
  ];
  for (const tool of tools)
    try {
      Promise.resolve(
        document.modelContext.registerTool(tool, { signal: life.signal }),
      ).catch(() => {});
    } catch {}
  window.addEventListener("pagehide", () => life.abort(), { once: true });
}
