// Food trucks (docs/FURNITURE.md#food-trucks): they drive in along the
// nearest road from the east edge of town, in the westbound lane, park for
// opening hours, and drive off west. (Everything else on the roads is in
// traffic.ts.) Position is a pure function of the clock, so it needs no state
// and replays identically.
import { hourOf } from './clock.ts';
import type { Item, Simulation } from './sim.ts';
import { DRIVABLE } from './roads.ts';

/** Game minutes to drive between the edge of town and the pitch. */
const DRIVE_MINUTES = 12;
/** Each truck in the convoy arrives this many minutes after the one before. */
const STAGGER_MINUTES = 3;

export interface VehiclePose {
  x: number;
  y: number;
  facing: 'left' | 'right' | 'up' | 'down';
  moving: boolean;
}

type Waypoint = [x: number, y: number];

/** Where a street vehicle is right now, or null if it isn't in town. */
export function vehicleAt(sim: Simulation, item: Item): VehiclePose | null {
  const hours = item.type.hours;
  if (!hours || !item.type.street || item.gone || sim.dayOff()) return null;

  const convoy = sim.activeItems().filter((i) => i.type.street && i.level === item.level);
  const stagger = (convoy.indexOf(item) * STAGGER_MINUTES) / 60;
  const drive = DRIVE_MINUTES / 60;
  const hour = hourOf(sim.tick);
  const [open, close] = hours;
  const arrive = open - drive - (convoy.length - 1) * (STAGGER_MINUTES / 60) + stagger;
  const leave = close + stagger;
  const [x, y] = item.def.p;

  if (hour < arrive || hour >= leave + drive) return null;
  if (hour >= arrive + drive && hour < leave) return { x, y, facing: 'up', moving: false };

  const road = roadRow(sim, item);
  const width = sim.grids.get(item.level)!.w;
  const arriving = hour < leave;
  const route: Waypoint[] = arriving
    ? [[width + 2, road], [x, road], [x, y]]
    : [[x, y], [x, road], [-item.type.size[0] - 2, road]];
  const t = arriving ? (hour - arrive) / drive : (hour - leave) / drive;
  return along(route, Math.min(1, Math.max(0, t)));
}

/** The road below a vehicle's pitch: its far lane, where traffic heads west (we drive on the left). */
function roadRow(sim: Simulation, item: Item): number {
  const level = sim.levels.get(item.level)!;
  const grid = sim.grids.get(item.level)!;
  const [x, y] = item.def.p;
  const isRoad = (row: number) => DRIVABLE.has(level.rooms[grid.roomAt(x, row)]?.floor ?? '');
  let row = y;
  while (row < grid.h && !isRoad(row)) row++;
  if (row === grid.h) return y;
  while (row + 1 < grid.h && isRoad(row + 1)) row++;
  return row;
}

/** A point a fraction `t` of the way along a route of straight segments. */
function along(route: Waypoint[], t: number): VehiclePose {
  const lengths = route.slice(1).map(([x, y], i) => Math.abs(x - route[i]![0]) + Math.abs(y - route[i]![1]));
  let remaining = t * lengths.reduce((a, b) => a + b, 0);
  for (const [i, length] of lengths.entries()) {
    const [ax, ay] = route[i]!;
    const [bx, by] = route[i + 1]!;
    if (remaining <= length || i === lengths.length - 1) {
      const f = length === 0 ? 1 : Math.min(1, remaining / length);
      const facing = bx > ax ? 'right' : bx < ax ? 'left' : by > ay ? 'down' : 'up';
      return { x: ax + (bx - ax) * f, y: ay + (by - ay) * f, facing, moving: t < 1 };
    }
    remaining -= length;
  }
  const [x, y] = route.at(-1)!;
  return { x, y, facing: 'up', moving: false };
}

