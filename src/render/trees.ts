/**
 * 樹木的繪製：Blender 建的低多邊形模型，以 InstancedMesh 一次畫完整片森林。
 *
 * 原本每棵樹是三個獨立網格（樹幹＋兩團樹冠），三百多棵樹光是樹就佔了
 * 上千次 draw call，加上陰影還要再畫一遍。改成三個 InstancedMesh 之後，
 * 不論幾棵樹都只有三次（陰影另三次）。
 *
 * 模型來源是 art/build_tree.py，匯出約定寫在那支腳本的開頭。
 *
 * 樹的擺放與碰撞圓仍由 terrain.ts 同步決定 —— 模擬層的導航資料不能等
 * 一個非同步的模型載入。這裡只負責「長什麼樣子」，晚一點出現也無妨。
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import treeUrl from "../assets/models/tree.glb?url";

export interface TreePlacement {
  x: number;
  z: number;
  /** 樹冠縮放。樹幹不跟著縮放，與原本程式生成的樹一致。 */
  scale: number;
  /** 樹冠色票的索引。 */
  tint: number;
}

const TRUNK_COLOR = 0x665c42;
/** 副樹冠和原本一樣是固定色：深色的樹頂端偏亮、淺色的樹頂端偏暗，整片森林的色調因此比較平均。 */
const CANOPY_TOP_COLOR = 0x527c46;
const CANOPY_TINTS = [0x315d42, 0x3e724a, 0x547f48, 0x658b48];
/** 黃金角：讓相鄰的樹朝向錯開，又不必多消耗地形的亂數序列。 */
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function instancedMaterial(color: number): THREE.MeshStandardMaterial {
  // 模型的頂點色只帶明暗（底暗頂亮），乘上這裡的顏色才是最終色。
  return new THREE.MeshStandardMaterial({
    color,
    vertexColors: true,
    flatShading: true,
    roughness: 0.88,
  });
}

function findGeometry(root: THREE.Object3D, name: string): THREE.BufferGeometry {
  const node = root.getObjectByName(name) as THREE.Mesh | undefined;
  if (!node?.geometry) throw new Error(`tree.glb 缺少 ${name} 網格`);
  return node.geometry;
}

function forest(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 載入樹的模型，把每一棵樹放上去。回傳的 Promise 在樹出現在場景時完成。 */
export async function plantTrees(
  placements: readonly TreePlacement[],
  parent: THREE.Object3D,
): Promise<void> {
  const gltf = await new GLTFLoader().loadAsync(treeUrl);
  const trunks = forest(
    findGeometry(gltf.scene, "Trunk"),
    instancedMaterial(TRUNK_COLOR),
    placements.length,
  );
  const canopies = forest(
    findGeometry(gltf.scene, "Canopy"),
    instancedMaterial(0xffffff),
    placements.length,
  );
  const tops = forest(
    findGeometry(gltf.scene, "CanopyTop"),
    instancedMaterial(CANOPY_TOP_COLOR),
    placements.length,
  );

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const unit = new THREE.Vector3(1, 1, 1);
  const size = new THREE.Vector3();
  const tint = new THREE.Color();

  placements.forEach((tree, i) => {
    position.set(tree.x, 0, tree.z);
    rotation.setFromAxisAngle(up, i * GOLDEN_ANGLE);
    trunks.setMatrixAt(i, matrix.compose(position, rotation, unit));
    size.setScalar(tree.scale);
    matrix.compose(position, rotation, size);
    canopies.setMatrixAt(i, matrix);
    tops.setMatrixAt(i, matrix);
    canopies.setColorAt(i, tint.setHex(CANOPY_TINTS[tree.tint % CANOPY_TINTS.length]));
  });
  // 包圍球要涵蓋所有實例，視錐剔除才不會把整片森林一起剔掉。
  trunks.computeBoundingSphere();
  canopies.computeBoundingSphere();
  tops.computeBoundingSphere();
  parent.add(trunks, canopies, tops);
}
