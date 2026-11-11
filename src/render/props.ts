/**
 * 石頭、草叢與路磚：數量多、各自很小，原本每一個都是一次 draw call。
 *
 * - 石頭是 Blender 建的模型（art/build_rock.py），非同步載入。
 * - 草叢（三面小錐）與路磚（薄方塊）本身就是最簡單的幾何，交給 Blender
 *   也不會更好，直接用 THREE 的幾何做成 InstancedMesh，同步建立。
 *
 * 擺放由 terrain.ts 決定，這裡只負責畫。
 */
import * as THREE from "three";
import rockUrl from "../assets/models/rock.glb?url";
import { findGeometry, instanced, loadModel, shadedMaterial, type Placement } from "./instancing.js";
import { mat } from "./renderer.js";

export interface RockPlacement extends Placement {
  color: number;
}

export async function placeRocks(
  rocks: readonly RockPlacement[],
  parent: THREE.Object3D,
): Promise<void> {
  const model = await loadModel(rockUrl);
  parent.add(
    instanced(
      findGeometry(model, "Rock"),
      shadedMaterial(0xffffff),
      rocks,
      rocks.map((r) => r.color),
    ),
  );
}

/** 草叢與路磚都是單一顏色，共用 renderer 的材質快取即可。 */
export function placeGrass(grass: readonly Placement[], parent: THREE.Object3D): void {
  parent.add(instanced(new THREE.ConeGeometry(0.25, 0.7, 3), mat(0x91a85a), grass));
}

export function placeTiles(tiles: readonly Placement[], parent: THREE.Object3D): void {
  parent.add(instanced(new THREE.BoxGeometry(0.3, 0.04, 0.7), mat(0xd4ceaa), tiles));
}
