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
import type * as THREE from "three";
import treeUrl from "../assets/models/tree.glb?url";
import { findGeometry, instanced, loadModel, shadedMaterial, type Placement } from "./instancing.js";

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

/** 載入樹的模型，把每一棵樹放上去。回傳的 Promise 在樹出現在場景時完成。 */
export async function plantTrees(
  trees: readonly TreePlacement[],
  parent: THREE.Object3D,
): Promise<void> {
  const model = await loadModel(treeUrl);
  const trunks: Placement[] = trees.map((t, i) => ({
    x: t.x,
    y: 0,
    z: t.z,
    rotationY: i * GOLDEN_ANGLE,
    scale: { x: 1, y: 1, z: 1 },
  }));
  const canopies: Placement[] = trees.map((t, i) => ({
    ...trunks[i],
    scale: { x: t.scale, y: t.scale, z: t.scale },
  }));
  parent.add(
    instanced(findGeometry(model, "Trunk"), shadedMaterial(TRUNK_COLOR), trunks),
    instanced(
      findGeometry(model, "Canopy"),
      shadedMaterial(0xffffff),
      canopies,
      trees.map((t) => CANOPY_TINTS[t.tint % CANOPY_TINTS.length]),
    ),
    instanced(findGeometry(model, "CanopyTop"), shadedMaterial(CANOPY_TOP_COLOR), canopies),
  );
}
