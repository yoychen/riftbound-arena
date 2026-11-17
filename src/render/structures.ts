/**
 * 防禦塔與核心的 Blender 模型（art/build_structures.py）。
 *
 * 石造本體的顏色畫在頂點色裡；水晶（*Crystal）與發光部分（*Glow）只帶
 * 明暗，乘上隊伍色的發光材質，所以同一份模型兩隊共用。水晶的原點在自己
 * 中心，models.ts 把它掛在 userData.crystal，main.ts 讓它旋轉、浮動。
 *
 * 匯入即開始載入；開局時還沒載好就先用程式拼的版本，之後再換掉。
 */
import * as THREE from "three";
import towerUrl from "../assets/models/tower.glb?url";
import coreUrl from "../assets/models/core.glb?url";
import { loadModel, shadedMaterial } from "./instancing.js";

export type StructureType = "tower" | "core";

const PREFIX: Record<StructureType, string> = { tower: "Tower", core: "Core" };
/** 和原本程式版的水晶亮度相同。 */
const GLOW: Record<StructureType, number> = { tower: 0.8, core: 0.75 };

const templates: Partial<Record<StructureType, THREE.Object3D>> = {};
const bodyMaterial = shadedMaterial(0xffffff);

/** 依「種類＋隊伍色」共用的發光材質。 */
const glowMaterials = new Map<string, THREE.MeshStandardMaterial>();
function glowMaterial(type: StructureType, color: number) {
  const key = `${type}:${color}`;
  let m = glowMaterials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      vertexColors: true,
      flatShading: true,
      roughness: 0.4,
      emissive: color,
      emissiveIntensity: GLOW[type],
    });
    glowMaterials.set(key, m);
  }
  return m;
}

/** 兩種建築都載好時為 true。 */
export const structuresReady: Promise<boolean> = Promise.all(
  (["tower", "core"] as const).map((type) =>
    loadModel(type === "tower" ? towerUrl : coreUrl)
      .then((scene) => {
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          // 所有複本共用這份幾何，換局釋放模型時不能釋放它。
          mesh.userData.shared = true;
        });
        templates[type] = scene;
        return true;
      })
      .catch((error) => {
        console.error(`${type}.glb 載入失敗，改用程式生成的版本`, error);
        return false;
      }),
  ),
).then((ok) => ok.every(Boolean));

/**
 * 複製一座建築並套上隊伍色。水晶在回傳物件的 userData.crystal。
 * 模型還沒載好時回傳 null。
 */
export function createStructure(type: StructureType, color: number): THREE.Object3D | null {
  const template = templates[type];
  if (!template) return null;
  const root = template.clone();
  const glow = glowMaterial(type, color);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = mesh.name.startsWith(PREFIX[type] + "Body") ? bodyMaterial : glow;
  });
  root.userData.crystal = root.getObjectByName(PREFIX[type] + "Crystal");
  return root;
}
