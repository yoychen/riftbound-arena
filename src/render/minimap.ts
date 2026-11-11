/** 小地圖：兵線、河流、巢穴與所有單位的俯視縮圖。 */
import { mapCtx as mapctx } from "./renderer.js";
import type { World } from "../core/world.js";
import { lanePoints, river } from "./terrain.js";

export function drawMap(world: World, state: string) {
  const c = mapctx,
    mx = (x: number) => ((x + 47) / 94) * 210,
    mz = (z: number) => ((z + 40) / 80) * 168;
  c.fillStyle = "#243e35";
  c.fillRect(0, 0, 210, 168);
  c.strokeStyle = "#477f76";
  c.lineWidth = 10;
  c.beginPath();
  river.forEach((p, i) =>
    i ? c.lineTo(mx(p.x), mz(p.z)) : c.moveTo(mx(p.x), mz(p.z)),
  );
  c.stroke();
  c.lineWidth = 6;
  c.strokeStyle = "#9da780";
  for (const ps of lanePoints) {
    c.beginPath();
    ps.forEach((p, i) =>
      i ? c.lineTo(mx(p.x), mz(p.z)) : c.moveTo(mx(p.x), mz(p.z)),
    );
    c.stroke();
  }
  c.strokeStyle = "#d2b777";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(mx(0), mz(0), 12, 0, Math.PI * 2);
  c.stroke();
  for (const e of world.entities) {
    if (e.hp <= 0) continue;
    c.fillStyle = e.isPlayer
      ? "#fff2b6"
      : e.team === 0
        ? "#72dddc"
        : e.team === 1
          ? "#f98c91"
          : "#ffc477";
    let r =
      e.type === "minion"
        ? 1.5
        : e.type === "hero"
          ? 3.2
          : e.type === "boss"
            ? 5
            : 4;
    if (e.type === "tower" || e.type === "core") {
      c.fillRect(mx(e.x) - r, mz(e.z) - r, r * 2, r * 2);
    } else {
      c.beginPath();
      c.arc(mx(e.x), mz(e.z), r, 0, Math.PI * 2);
      c.fill();
    }
    if (e.isPlayer) {
      c.strokeStyle = "#fffbdc";
      c.lineWidth = 1;
      c.beginPath();
      c.arc(mx(e.x), mz(e.z), 5.5, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (world.player && state !== "select") {
    c.strokeStyle = "#e4ead480";
    c.lineWidth = 1;
    c.strokeRect(mx(world.player.x) - 29, mz(world.player.z) - 22, 58, 44);
  }
  if (world.ping && world.time < world.ping.until) {
    c.strokeStyle = "#ffe2a2";
    c.beginPath();
    c.arc(mx(world.ping.x), mz(world.ping.z), 6 + Math.sin(world.time * 5) * 2, 0, Math.PI * 2);
    c.stroke();
  }
}
