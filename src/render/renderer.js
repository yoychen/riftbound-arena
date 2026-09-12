/**
 * WebGL 場景的基礎設施：renderer、相機、光源，以及建立網格的小工具。
 *
 * 這一層只認識 THREE，不認識遊戲規則。
 */
import * as THREE from "three";

export const $ = (id) => document.getElementById(id);

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

export { renderer, scene, camera, sun, mat, mesh, box, sphere, cyl };

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

export { ctx as labelCtx, mapctx as mapCtx, W, H, resize, screen };
