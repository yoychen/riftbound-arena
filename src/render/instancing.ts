/**
 * 大量重複的場景裝飾（樹、石頭、草叢、路磚）共用的 InstancedMesh 工具。
 *
 * 地圖上這些東西原本各自是獨立網格，每一個都是一次 draw call，加上陰影
 * 再一次。同一種東西改用一個 InstancedMesh 一次畫完，數量多少都只花一次。
 *
 * 擺放仍由 terrain.ts 同步決定（亂數序列的取用順序不能動），這裡只負責畫。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** 一個實例的擺放。旋轉只繞 Y 軸，縮放可以不等比。 */
export interface Placement {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: { x: number; y: number; z: number };
}

const loader = new GLTFLoader();

/** 讀入 art/ 腳本匯出的 .glb。 */
export async function loadModel(url: string): Promise<THREE.Object3D> {
  return (await loadAnimatedModel(url)).scene;
}

/** 讀入帶骨架與動作的 .glb（英雄）。 */
export async function loadAnimatedModel(
  url: string,
): Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  const gltf = url.startsWith("data:")
    ? await loader.parseAsync(decodeDataUrl(url), "")
    : await loader.loadAsync(url);
  return { scene: gltf.scene, animations: gltf.animations };
}

/**
 * 小於 Vite 內嵌門檻的模型（或整包內嵌的靜態輸出）會變成 data: URL。
 * 直接解碼，不經過 fetch —— 有些嵌入環境的安全政策不允許 fetch data: URL。
 */
function decodeDataUrl(url: string): ArrayBuffer {
  const base64 = url.slice(url.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return bytes.buffer;
}

export function findGeometry(root: THREE.Object3D, name: string): THREE.BufferGeometry {
  const node = root.getObjectByName(name) as THREE.Mesh | undefined;
  if (!node?.geometry) throw new Error(`模型缺少 ${name} 網格`);
  return node.geometry;
}

/**
 * Blender 模型用的材質。模型的頂點色只帶明暗，乘上這裡的顏色才是最終色；
 * 要每個實例不同色時傳白色，再用 instanceColor 上色。
 */
export function shadedMaterial(color: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
  });
}

const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const size = new THREE.Vector3();
const matrix = new THREE.Matrix4();
const tint = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/** 把 matrix 設成這個擺放的變換。 */
export function composePlacement(p: Placement, out = matrix): THREE.Matrix4 {
  position.set(p.x, p.y, p.z);
  rotation.setFromAxisAngle(UP, p.rotationY);
  size.set(p.scale.x, p.scale.y, p.scale.z);
  return out.compose(position, rotation, size);
}

/**
 * 建一個 InstancedMesh 並放好所有實例。
 * @param colors 每個實例的顏色；不傳則全部使用材質本身的顏色。
 */
export function instanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly Placement[],
  colors?: readonly number[],
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((p, i) => {
    mesh.setMatrixAt(i, composePlacement(p));
    if (colors) mesh.setColorAt(i, tint.setHex(colors[i]));
  });
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // 包圍球要涵蓋所有實例，視錐剔除才不會把整批一起剔掉。
  mesh.computeBoundingSphere();
  return mesh;
}
