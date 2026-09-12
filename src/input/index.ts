/**
 * 鍵盤、滑鼠與觸控。
 *
 * 輸入狀態（按著哪些鍵、滑鼠有沒有按住、搖桿推到哪）是模擬的輸入，
 * 但生命週期屬於這一層，所以放在一個可變的 `input` 物件裡供模擬讀取，
 * 而不是塞進 world。
 *
 * 綁定用工廠函式，因為輸入要呼叫暫停、商店等畫面，而那些畫面又需要
 * 戰局組裝 —— 直接互相 import 會造成循環。
 */
import * as THREE from "three";
import { camera, W, H, $ } from "../render/renderer.js";
import { clamp } from "../core/vec.js";
import type { Entity, World } from "../core/world.js";
import { session } from "../ui/session.js";

export const input = {
  /** 游標在地面上的投影點。模擬層直接共用這個 Vector3。 */
  aim: new THREE.Vector3(0, 0, 0),
  mouse: new THREE.Vector2(),
  keys: new Set<string>(),
  mouseDown: false,
  /** 滑鼠是否動過。沒動過就沒有有意義的瞄準點，改為自動鎖定。 */
  pointerKnown: false,
  touchVector: { x: 0, z: 0 },
  attackPointerId: null as number | null,
  coarse: matchMedia("(pointer:coarse)").matches,
  /** 清空按住狀態，覆蓋層開關時用。 */
  reset() {
    this.mouseDown = false;
    this.keys.clear();
  },
};

const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** 重新計算游標在地面的落點。每幀與每次指標移動都會呼叫。 */
export function refreshAim() {
  ray.setFromCamera(input.mouse, camera);
  ray.ray.intersectPlane(ground, input.aim);
}

/** 輸入層要回呼的動作。全部由 main 注入，避免與畫面層互相 import。 */
export interface InputActions {
  world: World;
  /** 施放技能槽 0–3。 */
  playerCast: (slot: number) => void;
  attack: (world: World, entity: Entity) => void;
  /** 右鍵點地。 */
  setMoveDestination: (x: number, z: number) => void;
  /** 呼叫隊友集合。 */
  command: (x?: number, z?: number) => void;
  showShop: () => void;
  pauseGame: () => void;
  resume: () => void;
  resumeAudio: () => void;
  toggleSound: () => void;
}

export function bindInput({
  world,
  playerCast,
  attack,
  setMoveDestination,
  command,
  showShop,
  pauseGame,
  resume,
  resumeAudio,
  toggleSound,
}: InputActions) {
function pointerAim(e: PointerEvent) {
  input.mouse.set((e.clientX / W) * 2 - 1, (-e.clientY / H) * 2 + 1);
  input.pointerKnown = true;
  camera.updateMatrixWorld();
  ray.setFromCamera(input.mouse, camera);
  ray.ray.intersectPlane(ground, input.aim);
}
window.addEventListener("pointermove", pointerAim);
/** 玩家現在能不能操作：在戰鬥中，而且還活著。 */
function activePlayer(): Entity | null {
  if (session.state !== "playing") return null;
  const player = world.player;
  return player && player.hp > 0 ? player : null;
}

$("world").addEventListener("pointerdown", (e) => {
  const player = activePlayer();
  if (!player) return;
  pointerAim(e);
  if (e.button === 2) {
    e.preventDefault();
    setMoveDestination(input.aim.x, input.aim.z);
  } else if (e.button === 0) {
    input.attackPointerId = e.pointerId;
    input.mouseDown = true;
    attack(world, player);
    resumeAudio();
  }
});
function releaseAttackPointer(e: PointerEvent) {
  if (e.pointerId === input.attackPointerId) {
    input.attackPointerId = null;
    input.mouseDown = false;
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
    if (session.state === "shop") resume();
    else pauseGame();
    return;
  }
  if (session.state !== "playing") return;
  input.keys.add(k);
  if (["w", "a", "s", "d"].includes(k)) world.movePath = [];
  if (k === "q") playerCast(0);
  if (k === "e") playerCast(1);
  if (k === "r") playerCast(2);
  if (k === " ") playerCast(3);
  if (k === "g") command();
  if (k === "b") showShop();
});
window.addEventListener("keyup", (e) => input.keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  input.keys.clear();
  input.mouseDown = false;
  input.touchVector = { x: 0, z: 0 };
  if (session.state === "playing") pauseGame();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && session.state === "playing") pauseGame();
});
$("pause").onclick = pauseGame;
$("sound").onclick = toggleSound;
$("shopButton").onclick = showShop;
$("minimap").onclick = (e) => {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  command(
    ((e.clientX - r.left) / r.width) * 94 - 47,
    ((e.clientY - r.top) / r.height) * 80 - 40,
  );
};
let touchId: number | null = null;
const joystick = $("touchMove");
/** 搖桿中央會跟著手指跑的圓點。 */
const knob = () => joystick.firstElementChild as HTMLElement;
function joy(e: PointerEvent) {
  const r = joystick.getBoundingClientRect();
  let x = clamp((e.clientX - r.left - r.width / 2) / 36, -1, 1),
    z = clamp((e.clientY - r.top - r.height / 2) / 36, -1, 1);
  input.touchVector = { x, z };
  knob().style.transform = `translate(${x * 29}px,${z * 29}px)`;
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
// 手指離開、被系統取消、或指標捕捉被搶走，都要把搖桿歸位。
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  joystick.addEventListener(event, (raw) => {
    const e = raw as PointerEvent;
    if (e.pointerId !== touchId) return;
    touchId = null;
    input.touchVector = { x: 0, z: 0 };
    knob().style.transform = "none";
  });
$("touchAttack").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const player = activePlayer();
  if (!player) return;
  input.attackPointerId = e.pointerId;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  input.mouseDown = true;
  attack(world, player);
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  $("touchAttack").addEventListener(event, (raw) =>
    releaseAttackPointer(raw as PointerEvent),
  );

}
