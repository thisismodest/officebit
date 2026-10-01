// The town's ground (docs/BUILDER.md#roads-and-paths): roads, paths, forecourts, zebra
// crossings, and the pavements worked out from the roads. The town is built
// with these, and the map editor draws with them. Roads are stored as
// rectangles, so each knows which way it runs (for its centre line); a stroke
// of the brush becomes one rectangle per straight run.
import { CATALOG } from '../sim/catalog.ts';
import { footprint, freeRoomId, inRect, intersection, overlap } from '../sim/geometry.ts';
import type { FurnitureDef, LevelDef, Rect, RoomDef, Tile } from '../sim/world.ts';
import { aOrAn, type Problem } from './placement.ts';

export type Surface = 'road' | 'path' | 'forecourt' | 'water' | 'sand' | 'shallows' | 'runway' | 'apron';

/** How wide each surface is drawn, in tiles. */
const WIDTH: Record<Surface, number> = { road: 2, path: 1, forecourt: 1, water: 2, sand: 2, shallows: 2, runway: 3, apron: 2 };
/** What each surface is called on the map. */
const NAMES: Record<Surface, string> = { road: 'Road', path: 'Path', forecourt: 'Forecourt', water: 'River', sand: 'Beach', shallows: 'Shallows', runway: 'Runway', apron: 'Apron' };
/** Floors that are water: drawn across, a road or path becomes a bridge. */
const WATER = new Set(['water', 'shallows']);
/** Ground that isn't for walking or driving on as laid (water, the shallows, a beach): no road or path goes under it, and a road or path over it is bridged (over water) or laid on it. */
const SOFT = new Set(['water', 'shallows', 'sand']);
/** Small things a new road or path clears out of its way. Anything else (buildings, ponds, lots) stops it. */
export const CLEARABLE = new Set(['tree', 'bush', 'flowers', 'bench', 'lamppost']);
/** Floors nothing can be drawn over. */
const KEEP = new Set(['highway']);
/** How far along a path (tiles) to look for where it joins up. */
const MOST_PATH = 400;
/** Generated pavements carry this id prefix, so they can be laid again. */
const PAVEMENT = 'pavement-';
/** Grass where a pavement was rubbed out: pavements are never laid there again (until something's drawn over it). */
const VERGE = 'verge-';

/**
 * Pavements, worked out from the roads: every tile beside a road (diagonals
 * too, so they wrap round corners, and round the end of a dead end, like a
 * kerb) that isn't road itself, except along the highway, and on forecourts (they meet the road). Stored as runs along
 * each row, replacing any laid before.
 */
export function layPavements(level: LevelDef): void {
  const roads = level.rooms.filter((r) => r.floor === 'road').map((r) => r.rect);
  const keepOff = level.rooms.filter((r) => r.floor === 'highway' || r.floor === 'forecourt' || SOFT.has(r.floor) || isBridge(r)).map((r) => r.rect);
  const [w, h] = level.size;
  const isRoad = (x: number, y: number) => inAny(roads, x, y);
  const verges = level.rooms.filter((r) => r.id.startsWith(VERGE)).map((r) => r.rect);
  const kerb = (x: number, y: number) =>
    !isRoad(x, y) &&
    !inAny(keepOff, x, y) &&
    !inAny(verges, x, y) &&
    [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => isRoad(x + dx, y + dy)));
  level.rooms = level.rooms.filter((r) => !r.id.startsWith(PAVEMENT));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!kerb(x, y) || (x > 0 && kerb(x - 1, y))) continue;
      let end = x;
      while (end + 1 < w && kerb(end + 1, y)) end++;
      level.rooms.push({ id: `${PAVEMENT}${x}-${y}`, name: 'Pavement', rect: [x, y, end - x + 1, 1], floor: 'path' });
    }
  }
}

/** What a brush of `surface` covers with its top-left on `tile`. */
export function brush([x, y]: Tile, surface: Surface): Rect {
  const w = WIDTH[surface];
  return [x, y, w, w];
}

/** Why a stroke (of `surface`) can't cover this bit of ground, or null if it can (small things will be cleared). */
export function groundProblem(level: LevelDef, rect: Rect, surface?: Surface): Problem {
  const [x, y, w, h] = rect;
  if (x < 0 || y < 0 || x + w > level.size[0] || y + h > level.size[1]) return 'That runs off the map.';
  if (level.rooms.some((r) => KEEP.has(r.floor) && overlap(r.rect, rect))) return 'Leave the highway as it is.';
  if (surface && SOFT.has(surface) && level.rooms.some((r) => (r.floor === 'road' || isDrawnPath(r) || isCrossing(r) || isBridge(r)) && overlap(r.rect, rect))) {
    return surface === 'sand' ? 'A beach doesn’t go over a road or path.' : 'Water doesn’t go over a road or path: draw the road or path across the water instead, and it’s bridged.';
  }
  const inWay = level.furniture.find((f) => !CLEARABLE.has(f.t) && overlap(footprint(f), rect));
  return inWay ? `There's ${aOrAn(CATALOG[inWay.t]?.name.toLowerCase() ?? 'thing')} in the way.` : null;
}

/** A stroke (tiles in order, each a step from the last) as rectangles: one per straight run, as wide as the brush. */
export function strokeRects(stroke: readonly Tile[], surface: Surface): Rect[] {
  const w = WIDTH[surface];
  const span = ([ax, ay]: Tile, [bx, by]: Tile): Rect => [Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax) + w, Math.abs(by - ay) + w];
  if (stroke.length < 2) return stroke.map((t) => span(t, t));
  const rects: Rect[] = [];
  let start = 0;
  for (let i = 2; i <= stroke.length; i++) {
    if (i < stroke.length && sameWay(stroke[i - 2]!, stroke[i - 1]!, stroke[i]!)) continue;
    // Each run ends on the corner the next one starts from, so they overlap there.
    rects.push(span(stroke[start]!, stroke[i - 1]!));
    start = i - 1;
  }
  return rects;
}

/**
 * Lay a stroke of road, path, forecourt (hard standing cars can drive on,
 * with no lanes) or water. Small things in the way (and on the new pavements
 * beside a road) are cleared, and returned; paths and forecourts stop where
 * they meet a road and carry on the other side, and replace the other where
 * they cross it; a road replaces either. A road, path or forecourt across
 * water bridges it. Pavements are laid again.
 */
export function lay(level: LevelDef, rects: readonly Rect[], surface: Surface, name = NAMES[surface]): FurnitureDef[] {
  const roads = level.rooms.filter((r) => r.floor === 'road' || r.floor === 'zebra' || r.floor === 'zebraSide');
  const onRoad = (x: number, y: number) => roads.some((r) => inRect(r.rect, x, y));
  const pieces = surface === 'road' ? rects : rects.flatMap((rect) => cut(rect, onRoad));
  level.rooms = level.rooms.flatMap((room) =>
    isDrawnPath(room) && room.floor !== surface ? pieces.reduce<RoomDef[]>((kept, rect) => kept.flatMap((r) => without(r, rect)), [room]) : [room],
  );
  // Drawing over rubbed-out pavement takes the grass back up.
  level.rooms = level.rooms.filter((r) => !(r.id.startsWith(VERGE) && pieces.some((p) => overlap(p, r.rect))));
  const waters = level.rooms.filter((r) => WATER.has(r.floor)).map((r) => r.rect);
  for (const rect of pieces) {
    level.rooms.push({ id: freeRoomId(level, surface), name, rect, floor: surface });
    if (SOFT.has(surface)) continue;
    // Over water, a bridge: crossing the way the stroke runs.
    for (const water of waters) {
      if (!overlap(rect, water)) continue;
      const floor = rect[2] >= rect[3] ? 'bridgeSide' : 'bridge';
      level.rooms.push({ id: freeRoomId(level, 'bridge'), name: 'Bridge', rect: intersection(rect, water), floor });
    }
  }
  // A road's kerbs become pavement: clear those too.
  const reach = surface === 'road' ? pieces.map(([x, y, w, h]): Rect => [x - 1, y - 1, w + 2, h + 2]) : pieces;
  const cleared = level.furniture.filter((f) => CLEARABLE.has(f.t) && reach.some((r) => overlap(footprint(f), r)));
  level.furniture = level.furniture.filter((f) => !cleared.includes(f));
  if (surface === 'road') layPavements(level);
  return cleared;
}

/** Turn ground back to grass at a tile: see `eraseAll`. */
export function erase(level: LevelDef, tile: Tile): boolean {
  return eraseAll(level, [tile]);
}

/**
 * Turn ground back to grass, a stroke at a time: a path, forecourt, water,
 * beach or pavement tile, or a road's full width where you rub it out. Crossings and
 * bridges on it go too. Neighbouring tiles come out as one piece (so the river
 * isn't left in a hundred bits), and pavements are laid again once, at the
 * end. Rubbed-out pavement leaves verge it won't be laid over. Whether anything changed.
 */
export function eraseAll(level: LevelDef, tiles: readonly Tile[]): boolean {
  const cuts: Rect[] = [];
  const verges: Tile[] = [];
  for (const [x, y] of tiles) {
    const hit = level.rooms.filter((r) => (r.floor === 'road' || isDrawnPath(r) || isCrossing(r) || isBridge(r) || SOFT.has(r.floor)) && inRect(r.rect, x, y));
    if (hit.length > 0) cuts.push(...hit.map((r): Rect => (r.floor === 'road' ? acrossRoad(r.rect, x, y, 1) : [x, y, 1, 1])));
    // Pavement is laid from the roads, so rubbing it out leaves a patch of verge it won't be laid over.
    else if (level.rooms.some((r) => r.id.startsWith(PAVEMENT) && inRect(r.rect, x, y))) verges.push([x, y]);
  }
  if (cuts.length === 0 && verges.length === 0) return false;
  const pieces = runs(cuts);
  level.rooms = level.rooms.flatMap((room) => {
    if ((isCrossing(room) || isBridge(room)) && pieces.some((c) => overlap(c, room.rect))) return [];
    if (room.floor !== 'road' && !isDrawnPath(room) && !SOFT.has(room.floor)) return [room];
    if (!pieces.some((c) => overlap(c, room.rect))) return [room];
    return pieces.reduce<RoomDef[]>((kept, c) => kept.flatMap((r) => without(r, c)), [room]);
  });
  for (const [x, y, w, h] of runs(verges.map(([x, y]): Rect => [x, y, 1, 1]))) {
    level.rooms.push({ id: `${VERGE}${x}-${y}`, name: 'Verge', rect: [x, y, w, h], floor: 'grass' });
  }
  layPavements(level);
  return true;
}

/** Single tiles side by side in a row joined into runs (anything bigger, a road's width, kept as it is), duplicates dropped. */
function runs(rects: readonly Rect[]): Rect[] {
  const tiles = new Set(rects.filter(([, , w, h]) => w === 1 && h === 1).map(([x, y]) => `${x},${y}`));
  const joined: Rect[] = [];
  for (const key of [...tiles].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number) as [number, number];
    const [bx, by] = b.split(',').map(Number) as [number, number];
    return ay - by || ax - bx;
  })) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    const last = joined.at(-1);
    if (last && last[1] === y && last[0] + last[2] === x) last[2]++;
    else joined.push([x, y, 1, 1]);
  }
  const big = rects.filter(([, , w, h]) => w > 1 || h > 1);
  return [...joined, ...big.filter((r, i) => big.findIndex((q) => q.join() === r.join()) === i)];
}

/** A zebra crossing across the road at a tile, two tiles wide. */
export function addCrossing(level: LevelDef, [x, y]: Tile): Problem {
  const roads = level.rooms.filter((r) => r.floor === 'road' && inRect(r.rect, x, y));
  if (roads.length === 0) return 'Crossings go across a road.';
  if (roads.length > 1) return 'Not in the middle of a junction.';
  const road = roads[0]!.rect;
  const across = acrossRoad(road, x, y, 2);
  if (level.rooms.some((r) => isCrossing(r) && overlap(r.rect, across))) return "There's a crossing there already.";
  // `zebra` crosses a road running east–west; `zebraSide` one running north–south.
  const floor = road[2] >= road[3] ? 'zebra' : 'zebraSide';
  level.rooms.push({ id: freeRoomId(level, 'crossing'), name: 'Zebra crossing', rect: across, floor });
  return null;
}

/** Where a crossing at a tile would go (for the preview). */
export function crossingAt(level: LevelDef, [x, y]: Tile): Rect | null {
  const road = level.rooms.find((r) => r.floor === 'road' && inRect(r.rect, x, y));
  return road ? acrossRoad(road.rect, x, y, 2) : null;
}

/** Is there road, path, pavement or a crossing here (not just grass)? */
export function onStreet(level: LevelDef, x: number, y: number): boolean {
  return level.rooms.some((r) => ['road', 'path', 'zebra', 'zebraSide', 'forecourt', 'bridge', 'bridgeSide'].includes(r.floor) && inRect(r.rect, x, y));
}

/** Does a front door join up with the town: a path from it (or it itself) that reaches a pavement or a road? */
export function joinsUp(level: LevelDef, [x, y]: Tile): boolean {
  const joined = (i: number, j: number) => level.rooms.some((r) => (r.floor === 'road' || r.id.startsWith(PAVEMENT) || isCrossing(r)) && inRect(r.rect, i, j));
  const seen = new Set<string>();
  const queue: Tile[] = [[x, y]];
  while (queue.length > 0 && seen.size < MOST_PATH) {
    const [i, j] = queue.pop()!;
    if (seen.has(`${i},${j}`) || !onStreet(level, i, j)) continue;
    if (joined(i, j)) return true;
    seen.add(`${i},${j}`);
    queue.push([i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]);
  }
  return false;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** A path or forecourt that was drawn (front paths, park paths, ones you drew), not a pavement laid from the roads. */
/** Hard ground drawn on the map (paths, forecourts, an airfield's apron and runway), not pavement worked out from the roads. */
const HARD = new Set(['path', 'forecourt', 'apron', 'runway']);
function isDrawnPath(room: RoomDef): boolean {
  return HARD.has(room.floor) && !room.id.startsWith(PAVEMENT);
}

function isBridge(room: RoomDef): boolean {
  return room.floor === 'bridge' || room.floor === 'bridgeSide';
}

function isCrossing(room: RoomDef): boolean {
  return room.floor === 'zebra' || room.floor === 'zebraSide';
}

/** A slice straight across a road at a tile, `length` tiles along it. */
function acrossRoad([rx, ry, rw, rh]: Rect, x: number, y: number, length: number): Rect {
  if (rw >= rh) {
    const from = Math.min(x, rx + rw - length);
    return [Math.max(rx, from), ry, Math.min(length, rw), rh];
  }
  const from = Math.min(y, ry + rh - length);
  return [rx, Math.max(ry, from), rw, Math.min(length, rh)];
}

/** A room less a rectangle: what's left, as up to four rooms (above, below, left, right). */
function without(room: RoomDef, [cx, cy, cw, ch]: Rect): RoomDef[] {
  const [x, y, w, h] = room.rect;
  if (!overlap(room.rect, [cx, cy, cw, ch])) return [room];
  const top = Math.max(y, cy);
  const bottom = Math.min(y + h, cy + ch);
  const left = Math.max(x, cx);
  const right = Math.min(x + w, cx + cw);
  const rects: Rect[] = [
    [x, y, w, top - y],
    [x, bottom, w, y + h - bottom],
    [x, top, left - x, bottom - top],
    [right, top, x + w - right, bottom - top],
  ];
  return rects.filter(([, , rw, rh]) => rw > 0 && rh > 0).map((rect, i) => ({ ...room, id: `${room.id}~${i}`, rect }));
}

/** A thin rectangle less the tiles `gone` says to leave out: the runs left over. */
function cut([x, y, w, h]: Rect, gone: (x: number, y: number) => boolean): Rect[] {
  const tiles: Tile[] = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (!gone(i, j)) tiles.push([i, j]);
  const across = w >= h;
  const runs: Rect[] = [];
  for (const [i, j] of tiles) {
    const last = runs.at(-1);
    if (last && across && j === last[1] && i === last[0] + last[2]) last[2]++;
    else if (last && !across && i === last[0] && j === last[1] + last[3]) last[3]++;
    else runs.push([i, j, 1, 1]);
  }
  return runs;
}

/** Do a→b and b→c go the same way? */
function sameWay(a: Tile, b: Tile, c: Tile): boolean {
  return b[0] - a[0] === c[0] - b[0] && b[1] - a[1] === c[1] - b[1];
}

function inAny(rects: readonly Rect[], x: number, y: number): boolean {
  return rects.some((r) => inRect(r, x, y));
}

