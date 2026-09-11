import { describe, expect, it } from "vitest";
import { createEventQueue, type GameEvent } from "../src/core/events.js";

const ring = (x: number): GameEvent => ({
  type: "ring",
  x,
  z: 0,
  r: 1,
  color: 0,
  life: 0.45,
});

describe("副作用佇列", () => {
  it("依發生順序取出", () => {
    const queue = createEventQueue();
    queue.emit(ring(1));
    queue.emit({ type: "announce", text: "第二" });
    queue.emit(ring(3));

    const seen: GameEvent[] = [];
    queue.drain((e) => seen.push(e));
    expect(seen.map((e) => e.type)).toEqual(["ring", "announce", "ring"]);
    expect((seen[0] as { x: number }).x).toBe(1);
  });

  it("取出後佇列即清空", () => {
    const queue = createEventQueue();
    queue.emit(ring(1));
    expect(queue.size).toBe(1);
    queue.drain(() => {});
    expect(queue.size).toBe(0);

    let secondDrain = 0;
    queue.drain(() => secondDrain++);
    expect(secondDrain).toBe(0);
  });

  it("處理過程中發出的事件留到下一次取出，不會無限遞迴", () => {
    const queue = createEventQueue();
    queue.emit(ring(1));

    let handled = 0;
    queue.drain((e) => {
      handled++;
      if (e.type === "ring") queue.emit({ type: "announce", text: "連鎖" });
    });
    expect(handled).toBe(1);
    expect(queue.size).toBe(1);

    queue.drain(() => handled++);
    expect(handled).toBe(2);
    expect(queue.size).toBe(0);
  });

  it("clear() 丟棄尚未取用的事件", () => {
    const queue = createEventQueue();
    queue.emit(ring(1));
    queue.emit(ring(2));
    queue.clear();

    let handled = 0;
    queue.drain(() => handled++);
    expect(handled).toBe(0);
  });
});
