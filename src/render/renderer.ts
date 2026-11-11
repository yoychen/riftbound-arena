/**
 * WebGL 場景的基礎設施：renderer、相機、光源，以及建立網格的小工具。
 *
 * 這一層只認識 THREE，不認識遊戲規則。
 */
import * as THREE from "three";

/**
 * 取得畫面上的元素。
 *
 * 所有 id 都寫死在 index.html 裡，所以回傳非 null 的型別；真的找不到時
 * 明確拋錯，而不是讓 null 一路傳下去在別處炸開。
 */
export function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`找不到元素 #${id}`);
  return el;
}

let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: $("world") as HTMLCanvasElement,
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
/** 材質依「顏色＋自發光強度」共用，場上數千個網格只會用到十幾種。 */
const materials = new Map<string, THREE.MeshStandardMaterial>();
function mat(c: number, em = 0): THREE.MeshStandardMaterial {
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
  return materials.get(k)!;
}
function mesh(
  geo: THREE.BufferGeometry,
  c: number,
  x = 0,
  y = 0,
  z = 0,
  parent: THREE.Object3D = scene,
  em = 0,
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(c, em));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
type Vec = [x: number, y: number, z: number];

const box = (
    w: number,
    h: number,
    d: number,
    c: number,
    ...at: [...Vec, parent?: THREE.Object3D]
  ) => mesh(new THREE.BoxGeometry(w, h, d), c, ...at),
  sphere = (
    r: number,
    c: number,
    x: number,
    y: number,
    z: number,
    p?: THREE.Object3D,
    detail = 0,
  ) => mesh(new THREE.IcosahedronGeometry(r, detail), c, x, y, z, p),
  cyl = (
    rt: number,
    rb: number,
    h: number,
    c: number,
    x: number,
    y: number,
    z: number,
    p?: THREE.Object3D,
    n = 8,
  ) => mesh(new THREE.CylinderGeometry(rt, rb, h, n), c, x, y, z, p);

export { renderer, scene, camera, sun, mat, mesh, box, sphere, cyl };

const ctx = ($("labels") as HTMLCanvasElement).getContext("2d")!,
  mapctx = ($("minimap") as HTMLCanvasElement).getContext("2d")!;
let W = innerWidth,
  H = innerHeight;
const proj = new THREE.Vector3();
function resize() {
  W = innerWidth;
  H = innerHeight;
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  const labels = $("labels") as HTMLCanvasElement;
  labels.width = W * devicePixelRatio;
  labels.height = H * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener("resize", resize);
resize();
function screen(x: number, y: number, z: number) {
  proj.set(x, y, z).project(camera);
  return {
    x: ((proj.x + 1) * W) / 2,
    y: ((1 - proj.y) * H) / 2,
    visible: proj.z < 1 && proj.z > -1,
  };
}

export { ctx as labelCtx, mapctx as mapCtx, W, H, resize, screen };
