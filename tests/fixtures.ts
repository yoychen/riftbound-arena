/** 測試用的戰局組裝工具。 */

import { createUnit, type UnitType } from "../src/core/entities.js";
import type { Entity, World } from "../src/core/world.js";
import { createWorld } from "../src/core/world.js";
import type { GameEvent } from "../src/core/events.js";

export function makeWorld(overrides: Partial<World> = {}): World {
  return Object.assign(createWorld(), overrides);
}

/** 放一個單位到場上，並套用額外屬性（護盾、mods、座標⋯）。 */
export function spawn(
  world: World,
  type: UnitType,
  team: number,
  extra: Record<string, unknown> = {},
): Entity {
  const { x = 0, z = 0, hero = 0, lane = 0, ...rest } = extra;
  const entity = createUnit(
    world,
    type,
    team,
    x as number,
    z as number,
    hero as number,
    lane as number,
  );
  return Object.assign(entity, rest);
}

/** 取出佇列中的事件，方便斷言副作用。 */
export function drained(world: World): GameEvent[] {
  const events: GameEvent[] = [];
  world.events.drain((e) => events.push(e));
  return events;
}

export const typesOf = (events: GameEvent[]) => events.map((e) => e.type);
