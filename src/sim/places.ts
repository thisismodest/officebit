// Buildings on a map and what's inside them (docs/BUILDINGS.md#visiting).
// A building leads inside through a portal on the row just below its
// footprint (above, for buildings that face up); everything reachable from there without going back outdoors
// is "inside".
import { atDoorOf, covers, sides } from './geometry.ts';
import type { Person } from './person.ts';
import type { Item, Simulation } from './sim.ts';
import type { LevelDef, Place, PortalDef } from './world.ts';

export interface Interior {
  /** "Head office", "Rowan's house". */
  name: string;
  /** Entry level first, then any floors reached by stairs. */
  levels: LevelDef[];
}

export function interiorOf(sim: Simulation, item: Item): Interior | null {
  const entries = sim.world.portals.flatMap((portal) => {
    if (portal.a.level === item.level && atDoorOf(item.def, portal.a.p)) return [portal.b.level];
    if (portal.b.level === item.level && atDoorOf(item.def, portal.b.p)) return [portal.a.level];
    return [];
  });
  const entry = entries[0] && sim.levels.get(entries[0]);
  if (!entry) return null;

  // Walk portals from the entry, staying indoors.
  const seen = [entry];
  for (let i = 0; i < seen.length; i++) {
    const level = seen[i]!;
    for (const portal of sim.world.portals) {
      for (const [from, to] of sides(portal)) {
        const next = sim.levels.get(to.level);
        if (from.level === level.id && next && next.kind !== 'outside' && !seen.includes(next)) seen.push(next);
      }
    }
  }

  const name = item.def.label ?? (entry.kind === 'home' ? entry.name : item.type.name);
  return { name, levels: seen };
}

export interface Exit {
  kind: PortalDef['kind'];
  /** Where it comes out. */
  to: Place;
}

/** Tiles either side of a door (along its wall) that also count as clicking it. */
const DOOR_SIDES = 1;

/** The door or stairs at a tile (a door, or one tile either side of it, or the spot just inside it where you go through; anywhere on the stairs), and where it leads. */
export function exitAt(sim: Simulation, level: string, x: number, y: number): Exit | null {
  // Anywhere on a flight of stairs is the stairs.
  const stairs = sim.activeItems().find((i) => i.level === level && i.def.t === 'stairs' && covers(i.def, x, y));
  if (stairs) {
    for (const portal of sim.world.portals)
      for (const [here, there] of sides(portal)) if (here.level === level && covers(stairs.def, ...here.p)) return { kind: portal.kind, to: there };
  }
  const doors = sim.levels.get(level)?.doors ?? [];
  for (const portal of sim.world.portals) {
    for (const [here, there] of sides(portal)) {
      if (here.level !== level) continue;
      // Indoors, a portal sits just inside its doorway; outside (and on stairs) it is the doorway.
      const [ax, ay] = here.p;
      const door = doors.find(([dx, dy]) => Math.abs(dx - ax) + Math.abs(dy - ay) === 1) ?? here.p;
      // Walls run across the way you walk through: a door you go through vertically sits in a horizontal wall.
      const horizontal = door[1] !== ay || door[0] === ax;
      const hit = horizontal
        ? y === door[1] && Math.abs(x - door[0]) <= DOOR_SIDES
        : x === door[0] && Math.abs(y - door[1]) <= DOOR_SIDES;
      if (hit || (x === ax && y === ay)) return { kind: portal.kind, to: there };
    }
  }
  return null;
}

/** Through a building's front door (outside): where it comes out inside, or null if it has no way in. */
export function insideDoor(sim: Simulation, item: Item): Place | null {
  for (const portal of sim.world.portals)
    for (const [here, there] of sides(portal)) if (here.level === item.level && atDoorOf(item.def, here.p)) return there;
  return null;
}

/** Who's on any of these levels right now. */
export function occupants(sim: Simulation, levels: readonly LevelDef[]): Person[] {
  const ids = new Set(levels.map((l) => l.id));
  return sim.people.filter((p) => ids.has(p.level) && sim.present(p));
}

/** The tile just outside the front door of the building `levels` make up (one level, or several floors). */
export function outsideDoor(sim: Simulation, levels: ReadonlySet<string>): Place | null {
  for (const portal of sim.world.portals) {
    for (const [inside, out] of sides(portal)) {
      if (levels.has(inside.level) && sim.levels.get(out.level)?.kind === 'outside') return out;
    }
  }
  return null;
}
