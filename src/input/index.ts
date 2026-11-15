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
import { CAST_RANGE } from "../core/skills.js";
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
  /** 觸控時按住技能按鈕拖曳瞄準中；畫面層依它畫出地面上的指示。 */
  skillAim: null as SkillAim | null,
  /** 清空按住狀態，覆蓋層開關時用。 */
  reset() {
    this.mouseDown = false;
    this.keys.clear();
    this.skillAim = null;
  },
};

export interface SkillAim {
  slot: number;
  /** 落點相對玩家的位移；手指還在中央（快速施放）時為 null。 */
  offset: { x: number; z: number } | null;
  /** 手指正停在取消區上，放開就不施放。 */
  cancel: boolean;
}

/** 手指移動不超過這個距離（像素）放開，就是「點一下快速施放」。 */
const AIM_DEADZONE = 18;
/** 手指拖這麼遠（像素）就是最遠的落點，CAST_RANGE 公尺。 */
const AIM_RADIUS = 95;

let bound: Pick<InputActions, "world" | "playerCast"> | null = null;

/**
 * 觸控時按住技能按鈕：點一下照自動瞄準快速施放；按住拖曳則手動指定落點，
 * 方向與距離跟著手指相對按下位置的位移（畫面往右是 +X、往下是 +Z，
 * 鏡頭沒有轉向，兩者剛好對齊）；放開時手指停在取消區上就不施放。
 *
 * 給輕度玩家：不拖就跟以前一樣，拖曳是需要精準方向時才用的進階操作。
 */
export function beginSkillAim(slot: number, e: PointerEvent, button: HTMLElement) {
  if (!bound || input.skillAim || session.state !== "playing") return;
  const actions = bound;
  const id = e.pointerId,
    x0 = e.clientX,
    y0 = e.clientY;
  const cancelZone = $("aimCancel");
  const state: SkillAim = { slot, offset: null, cancel: false };
  input.skillAim = state;
  button.setPointerCapture(id);
  button.classList.add("aiming");
  cancelZone.classList.add("show");

  const track = (ev: PointerEvent) => {
    if (ev.pointerId !== id) return;
    const dx = ev.clientX - x0,
      dy = ev.clientY - y0,
      len = Math.hypot(dx, dy);
    const r = cancelZone.getBoundingClientRect();
    state.cancel =
      ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    cancelZone.classList.toggle("hot", state.cancel);
    const reach = (Math.min(len, AIM_RADIUS) / AIM_RADIUS) * CAST_RANGE;
    state.offset = len < AIM_DEADZONE ? null : { x: (dx / len) * reach, z: (dy / len) * reach };
  };
  let done = false;
  const finish = (ev: PointerEvent) => {
    if (ev.pointerId !== id || done) return;
    done = true;
    button.classList.remove("aiming");
    cancelZone.classList.remove("show", "hot");
    for (const [name, fn] of handlers) button.removeEventListener(name, fn as EventListener);
    // 覆蓋層打開（暫停、商店）時 reset 會先清掉瞄準，這時就不施放。
    const active = input.skillAim === state;
    input.skillAim = null;
    if (ev.type !== "pointerup" || !active || state.cancel) return;
    const player = actions.world.player;
    actions.playerCast(
      slot,
      state.offset && player ? { x: player.x + state.offset.x, z: player.z + state.offset.z } : undefined,
    );
  };
  const handlers: [string, (ev: PointerEvent) => void][] = [
    ["pointermove", track],
    ["pointerup", finish],
    ["pointercancel", finish],
    ["lostpointercapture", finish],
  ];
  for (const [name, fn] of handlers) button.addEventListener(name, fn as EventListener);
}

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
  /** 施放技能槽 0–3。aim 是觸控拖曳指定的落點。 */
  playerCast: (slot: number, aim?: { x: number; z: number }) => void;
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
bound = { world, playerCast };
function pointerAim(e: PointerEvent) {
  input.mouse.set((e.clientX / W) * 2 - 1, (-e.clientY / H) * 2 + 1);
  input.pointerKnown = true;
  camera.updateMatrixWorld();
  ray.setFromCamera(input.mouse, camera);
  ray.ray.intersectPlane(ground, input.aim);
}
// 只有滑鼠（與觸控筆）有游標。手指在搖桿或按鈕上滑動不是在瞄準，
// 否則觸控時角色會面向搖桿底下那塊地面。
window.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "touch") pointerAim(e);
});
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
