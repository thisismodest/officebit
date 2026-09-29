// Where furniture may go (docs/BUILDER.md#safe-zones). Somewhere is safe if the
// piece sits wholly inside one room, off the walls, clear of doors and stairs
// (and the tiles either side of a doorway), clear of other furniture (floor
// coverings like rugs can go under and over things), on grass
// if it's outdoors (or hard ground, for chargers, bays and the like), with its spots free to stand in, and if nothing on the
// level (a door, a spot someone uses) becomes unreachable because of it.
import { CATALOG } from '../sim/catalog.ts';
import { Grid } from '../sim/grid.ts';
import type { FurnitureDef, LevelDef, PortalDef, Tile } from '../sim/world.ts';

export type Problem = string | null;

const DIRS: Tile[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/**
 * Why `t` can't go at `at` on this level, or null if it can. `moving` is the
 * piece being moved, if it's already on the level (it doesn't get in its own way).
 */
export function placementProblem(level: LevelDef, portals: readonly PortalDef[], t: string, at: Tile, moving?: FurnitureDef): Problem {
  const type = CATALOG[t];
  if (!type) return 'Pick something to place.';
  const [w, h] = type.size;
  const others = level.furniture.filter((f) => f !== moving);
  const without: LevelDef = { ...level, furniture: others };
  const grid = new Grid(without);
  const footprint = tilesOf(at, w, h);
  const ends = portals.flatMap((p) => [p.a, p.b]).filter((end) => end.level === level.id).map((end) => end.p);
  const keepClear = new Set([...level.doors, ...ends].flatMap((d) => [d, ...DIRS.map(([dx, dy]): Tile => [d[0] + dx, d[1] + dy])]).map(key));

  let room: number | undefined;
  for (const [x, y] of footprint) {
    if (!grid.inBounds(x, y)) return "That doesn't fit there.";
    if (grid.wall[grid.i(x, y)]) return "That's in a wall.";
    // Rugs are part of the floor: they can go right up to (and across) a doorway.
    if (!isCovering(t) && keepClear.has(key([x, y]))) return 'Keep doorways and stairs clear.';
    const here = grid.roomAt(x, y);
    if (room !== undefined && here !== room) return 'It has to sit inside one room.';
    room = here;
    if (level.kind === 'outside') {
      const floor = level.rooms[here]?.floor;
      if (type.hardStanding && floor !== 'forecourt' && floor !== 'path') return 'That goes on a forecourt or paving.';
      if (!type.hardStanding && floor !== 'grass') return 'Outdoors, things go on the grass.';
    }
  }
  // Rugs and the like lie on the floor: other things can stand on them, and they can slide under other things.
  const overlap = !isCovering(t) && others.find((f) => !isCovering(f.t) && overlaps(f, at, w, h));
  if (overlap) return `There's already ${aOrAn(CATALOG[overlap.t]!.name.toLowerCase())} there.`;

  const placed: FurnitureDef = { ...(moving ?? {}), t, p: at };
  // Where people stand or sit to use it must be free: not a wall, a doorway, or another piece people use (a rug is fine).
  for (const [dx, dy] of type.spots) {
    const [x, y] = [at[0] + dx, at[1] + dy];
    const inside = dx >= 0 && dy >= 0 && dx < w && dy < h;
    if (inside) continue;
    const taken = others.some((f) => overlaps(f, [x, y], 1, 1) && (CATALOG[f.t]!.solid || CATALOG[f.t]!.spots.length > 0));
    if (!grid.walkable(x, y) || keepClear.has(key([x, y])) || taken) return 'There needs to be room to use it.';
  }

  // Nothing that could be reached from the way in before may be cut off.
  const after: LevelDef = { ...level, furniture: [...others, placed] };
  if (cutsOff({ ...level, furniture: others }, after, portals)) return 'That would block the way.';
  const ownSpots = spotsOf(placed);
  const reached = reachable(new Grid(after), ends.slice(0, 1));
  if (ownSpots.length > 0 && !ownSpots.some((s) => reached.has(key(s)))) return 'Nobody could get to it there.';
  return null;
}

/**
 * Would changing a level from `before` to `after` cut anything off: a door,
 * a stair, or somewhere people use furniture from, that could be reached
 * from the way in before but not after?
 */
export function cutsOff(before: LevelDef, after: LevelDef, portals: readonly PortalDef[]): boolean {
  const ends = portals.flatMap((p) => [p.a, p.b]).filter((end) => end.level === before.id).map((end) => end.p);
  const entrance = ends.slice(0, 1);
  const was = reachable(new Grid(before), entrance);
  const now = reachable(new Grid(after), entrance);
  return [...ends, ...before.furniture.flatMap(spotsOf)].some((target) => was.has(key(target)) && !now.has(key(target)));
}

/** "a bench", "an empty lot". */
export function aOrAn(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

/** A floor covering (a rug, flowers): not solid, and nothing to use it from. */
export function isCovering(t: string): boolean {
  const type = CATALOG[t];
  return !!type && !type.solid && type.spots.length === 0;
}

/** Tiles reachable on foot from `from`. */
function reachable(grid: Grid, from: readonly Tile[]): Set<string> {
  const seen = new Set<string>();
  const queue = from.filter(([x, y]) => grid.walkable(x, y));
  for (const tile of queue) seen.add(key(tile));
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of DIRS) {
      const next: Tile = [x + dx, y + dy];
      if (!seen.has(key(next)) && grid.walkable(next[0], next[1])) {
        seen.add(key(next));
        queue.push(next);
      }
    }
  }
  return seen;
}

function spotsOf(def: FurnitureDef): Tile[] {
  return (CATALOG[def.t]?.spots ?? []).map(([dx, dy]): Tile => [def.p[0] + dx, def.p[1] + dy]);
}

function tilesOf([x, y]: Tile, w: number, h: number): Tile[] {
  return Array.from({ length: w * h }, (_, i): Tile => [x + (i % w), y + Math.floor(i / w)]);
}

function overlaps(f: FurnitureDef, [x, y]: Tile, w: number, h: number): boolean {
  const [fw, fh] = CATALOG[f.t]?.size ?? [1, 1];
  return x < f.p[0] + fw && f.p[0] < x + w && y < f.p[1] + fh && f.p[1] < y + h;
}

function key([x, y]: Tile): string {
  return `${x},${y}`;
}
