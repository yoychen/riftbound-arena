/**
 * 地形：兵線、河流、樹石草叢與兩座基地。
 *
 * 樹木在擺放時順手登記碰撞圓，這份 `obstacles` 就是模擬層繞路的依據 ——
 * 也是為什麼導航資料由呈現層注入而非在核心層生成。
 *
 * 匯入這個模組就會建好整張地圖（模組層副作用），由 main 負責在對的時機匯入。
 */
import * as THREE from "three";
import { createRng, TERRAIN_SEED } from "../core/rng.js";
import { TEAM_COLORS } from "../config/colors.js";
import { box, cyl, mesh, scene, sphere } from "./renderer.js";

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
  teamColors = TEAM_COLORS;
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

export { mapRoot, lanes, curves, lanePoints, obstacles, bases, river, teamColors };
