// Rooms and doorways (docs/BUILDER.md#rooms): plain edits over a level, for
// the map editor. A walled room is a rectangle whose edge is its wall; rooms
// next to each other overlap by a tile, so they share one wall. Rooms sit
// inside or beside each other, never across; a new room snaps onto walls
// nearby, gets a doorway if it has none, and may never cut anything off.
import { CATALOG } from '../sim/catalog.ts';
import { Grid } from '../sim/grid.ts';
import type { FurnitureDef, LevelDef, PortalDef, Rect, RoomDef, Tile } from '../sim/world.ts';
import { aOrAn, cutsOff, type Problem } from './placement.ts';

/** The smallest room a wall can make: one tile of floor inside it, all round. */
export const MIN_ROOM = 3;
/** How near (tiles) an edge must be to a wall to snap onto it. */
const SNAP = 1;

/** The building's own outside wall: its biggest walled room. */
export function outerRoom(level: LevelDef): RoomDef | undefined {
  return [...level.rooms].filter((r) => r.walled).sort((a, b) => area(b.rect) - area(a.rect))[0];
}

/** The room a tile's in: the innermost one, walled or not. */
export function roomAt(level: LevelDef, [x, y]: Tile): RoomDef | undefined {
  return level.rooms.filter((r) => inRect(r.rect, x, y)).sort((a, b) => area(a.rect) - area(b.rect))[0];
}

/** The walled room whose wall a tile's on, innermost first (not the outside wall, if there's another). */
export function wallAt(level: LevelDef, [x, y]: Tile): RoomDef | undefined {
  return level.rooms
    .filter((r) => r.walled && onEdge(r.rect, x, y))
    .sort((a, b) => area(a.rect) - area(b.rect))[0];
}

/** Pull each edge of a rectangle onto a wall that's within a tile of it, so neighbouring rooms share their wall. */
export function snap(level: LevelDef, [x, y, w, h]: Rect, except?: RoomDef): Rect {
  let [left, top, right, bottom] = [x, y, x + w - 1, y + h - 1];
  for (const room of level.rooms) {
    if (!room.walled || room === except) continue;
    const [rx, ry, rw, rh] = room.rect;
    const lines = { xs: [rx, rx + rw - 1], ys: [ry, ry + rh - 1] };
    const alongY = top <= ry + rh - 1 && bottom >= ry;
    const alongX = left <= rx + rw - 1 && right >= rx;
    if (alongY) {
      for (const line of lines.xs) {
        if (Math.abs(left - line) <= SNAP) left = line;
        if (Math.abs(right - line) <= SNAP) right = line;
      }
    }
    if (alongX) {
      for (const line of lines.ys) {
        if (Math.abs(top - line) <= SNAP) top = line;
        if (Math.abs(bottom - line) <= SNAP) bottom = line;
      }
    }
  }
  return [left, top, right - left + 1, bottom - top + 1];
}

/** Why a walled room can't be `rect` here (or `room` can't be resized to it), or null if it can. */
export function roomProblem(level: LevelDef, rect: Rect, room?: RoomDef): Problem {
  const [, , w, h] = rect;
  if (w < MIN_ROOM || h < MIN_ROOM) return 'A room needs at least a tile of floor inside its walls.';
  const outer = outerRoom(level);
  if (!outer || room === outer) return 'The outside walls stay as they are.';
  if (!contains(outer.rect, rect)) return 'Rooms go inside the building.';
  for (const other of level.rooms) {
    if (!other.walled || other === room || other === outer) continue;
    if (contains(other.rect, rect) || contains(rect, other.rect)) continue;
    const [ix, iy, iw, ih] = intersection(other.rect, rect);
    if (iw > 1 && ih > 1) return 'Rooms can sit inside or beside each other, but not across.';
    // Sharing a wall is fine; overlapping a whole wall's length and more isn't.
    if ((iw === 1 || ih === 1) && !(onEdge(other.rect, ix, iy) && onEdge(rect, ix, iy))) return 'Rooms can sit inside or beside each other, but not across.';
  }
  // The new walls (where there isn't one already) mustn't go through furniture, or across a way in or the stairs.
  const grid = new Grid(level);
  for (const [tx, ty] of edgeTiles(rect)) {
    if (grid.wall[grid.i(tx, ty)]) continue;
    const inWay = level.furniture.find((f) => covers(f, tx, ty));
    if (inWay) return `There's ${aOrAn(CATALOG[inWay.t]?.name.toLowerCase() ?? 'thing')} where the wall would go.`;
  }
  return null;
}

/** Make a walled room. It gets a doorway, facing the way in, if it has none. */
export function addRoom(level: LevelDef, portals: readonly PortalDef[], rect: Rect, name = 'Room'): string | RoomDef {
  const problem = roomProblem(level, rect) ?? blocksWay(level, portals, rect);
  if (problem) return problem;
  const floor = roomAt(level, [rect[0] + 1, rect[1] + 1])?.floor ?? outerRoom(level)!.floor;
  const room: RoomDef = { id: uniqueRoom(level, 'room'), name, rect, floor, walled: true };
  return reshape(level, portals, (after) => after.rooms.push(room)) ?? room;
}

/** Move a room's walls. Doorways still on them stay; one that isn't gets closed; it gets a doorway if it's left with none. */
export function resizeRoom(level: LevelDef, portals: readonly PortalDef[], id: string, rect: Rect): Problem {
  const room = level.rooms.find((r) => r.id === id);
  if (!room) return 'There’s no room there.';
  const problem = roomProblem(level, rect, room) ?? blocksWay(level, portals, rect);
  if (problem) return problem;
  return reshape(level, portals, (after) => {
    after.rooms.find((r) => r.id === id)!.rect = rect;
  });
}

/** Knock a room through: its walls go, and any doorways in them. What's in it stays. */
export function removeRoom(level: LevelDef, portals: readonly PortalDef[], id: string): Problem {
  const room = level.rooms.find((r) => r.id === id);
  if (!room) return 'There’s no room there.';
  if (room === outerRoom(level)) return 'The outside walls stay as they are.';
  return reshape(level, portals, (after) => {
    after.rooms = after.rooms.filter((r) => r.id !== id);
  });
}

/** Open a doorway in a wall, or close one that's there. The way in and the stairs stay as they are. */
export function toggleDoor(level: LevelDef, portals: readonly PortalDef[], [x, y]: Tile): Problem {
  const ends = portals.flatMap((p) => [p.a, p.b]).filter((end) => end.level === level.id);
  if (ends.some((end) => end.p[0] === x && end.p[1] === y)) return 'That’s the way in: it stays.';
  const [w, h] = level.size;
  if (x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1) return 'Doorways in the outside walls lead nowhere.';
  const open = level.doors.some(([dx, dy]) => dx === x && dy === y);
  if (open) {
    const after = { ...level, doors: level.doors.filter(([dx, dy]) => dx !== x || dy !== y) };
    const shut = after.rooms.find((r) => r.walled && r !== outerRoom(after) && onEdge(r.rect, x, y) && !hasDoor(after, r));
    if (shut) return `The ${shut.name.toLowerCase()} needs a way in: open another doorway first.`;
    if (cutsOff(level, after, portals)) return 'Closing it would cut somewhere off.';
    level.doors = after.doors;
    return null;
  }
  const grid = new Grid(level);
  if (!grid.wall[grid.i(x, y)]) return 'Doorways go in walls.';
  // A doorway joins the floor on either side of the wall: along it (not at a corner), with room to walk through.
  const floor = (fx: number, fy: number) => grid.inBounds(fx, fy) && !grid.wall[grid.i(fx, fy)];
  const across = (floor(x, y - 1) && floor(x, y + 1)) || (floor(x - 1, y) && floor(x + 1, y));
  if (!across) return 'Not at a corner: somewhere along a wall.';
  if (level.furniture.some((f) => covers(f, x - 1, y) || covers(f, x + 1, y) || covers(f, x, y - 1) || covers(f, x, y + 1)) && !walkThrough(level, x, y)) {
    return 'There’s furniture in the way of it.';
  }
  level.doors.push([x, y]);
  return null;
}

/** A room's name and floor. */
export function restyleRoom(level: LevelDef, id: string, changes: { name?: string; floor?: string }): Problem {
  const room = level.rooms.find((r) => r.id === id);
  if (!room) return 'There’s no room there.';
  if (changes.name !== undefined) room.name = changes.name.trim() || room.name;
  if (changes.floor) room.floor = changes.floor;
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Apply a change to a copy, tidy its doorways, give any shut-in room a doorway, check nothing's cut off, then keep it. */
function reshape(level: LevelDef, portals: readonly PortalDef[], change: (after: LevelDef) => void): Problem {
  const after: LevelDef = { ...level, rooms: structuredClone(level.rooms), doors: structuredClone(level.doors) };
  change(after);
  tidyDoors(after, portals);
  for (const room of after.rooms) {
    if (room.walled && room !== outerRoom(after) && !hasDoor(after, room)) {
      const door = doorwayFor(after, portals, room);
      if (!door) return 'There’s nowhere to put a doorway in.';
      after.doors.push(door);
    }
  }
  if (cutsOff(level, after, portals)) return 'That would cut somewhere off.';
  level.rooms = after.rooms;
  level.doors = after.doors;
  return null;
}

/** Would walls here go across the stairs (or any way in that isn't already a doorway in a wall, like the front door)? */
function blocksWay(level: LevelDef, portals: readonly PortalDef[], rect: Rect): Problem {
  const doorway = (x: number, y: number) => level.doors.some(([dx, dy]) => dx === x && dy === y);
  const ends = portals.flatMap((p) => [p.a, p.b]).filter((end) => end.level === level.id && !doorway(...end.p));
  return ends.some((end) => onEdge(rect, end.p[0], end.p[1])) ? 'Keep the stairs clear.' : null;
}

/** Doorways that aren't in any wall any more (the room they were in was knocked through, or moved) are just floor: drop them. Ways in stay. */
function tidyDoors(level: LevelDef, portals: readonly PortalDef[]): void {
  const ends = portals.flatMap((p) => [p.a, p.b]).filter((end) => end.level === level.id);
  level.doors = level.doors.filter(([x, y]) => ends.some((e) => e.p[0] === x && e.p[1] === y) || level.rooms.some((r) => r.walled && onEdge(r.rect, x, y)));
}

function hasDoor(level: LevelDef, room: RoomDef): boolean {
  return level.doors.some(([x, y]) => onEdge(room.rect, x, y));
}

/** Where a room's doorway goes: along one of its walls, joining floor on both sides, as near the way in as it can be. */
function doorwayFor(level: LevelDef, portals: readonly PortalDef[], room: RoomDef): Tile | null {
  const grid = new Grid(level);
  const floor = (x: number, y: number) => grid.walkable(x, y);
  const entrance = portals.flatMap((p) => [p.a, p.b]).find((end) => end.level === level.id)?.p ?? [level.size[0] / 2, level.size[1] / 2];
  const [rx, ry, rw, rh] = room.rect;
  const options = edgeTiles(room.rect).filter(([x, y]) => {
    const corner = (x === rx || x === rx + rw - 1) && (y === ry || y === ry + rh - 1);
    if (corner) return false;
    const vertical = x === rx || x === rx + rw - 1;
    return vertical ? floor(x - 1, y) && floor(x + 1, y) : floor(x, y - 1) && floor(x, y + 1);
  });
  options.sort((a, b) => Math.hypot(a[0] - entrance[0], a[1] - entrance[1]) - Math.hypot(b[0] - entrance[0], b[1] - entrance[1]));
  return options[0] ?? null;
}

/** With a doorway here, could people still walk through it (furniture beside it doesn't block both sides)? */
function walkThrough(level: LevelDef, x: number, y: number): boolean {
  const grid = new Grid({ ...level, doors: [...level.doors, [x, y]] });
  return (grid.walkable(x, y - 1) && grid.walkable(x, y + 1)) || (grid.walkable(x - 1, y) && grid.walkable(x + 1, y));
}

/** Every tile along a rectangle's edge. */
export function edgeTiles([x, y, w, h]: Rect): Tile[] {
  const tiles: Tile[] = [];
  for (let i = x; i < x + w; i++) tiles.push([i, y], [i, y + h - 1]);
  for (let j = y + 1; j < y + h - 1; j++) tiles.push([x, j], [x + w - 1, j]);
  return tiles;
}

function onEdge([x, y, w, h]: Rect, tx: number, ty: number): boolean {
  return inRect([x, y, w, h], tx, ty) && (tx === x || ty === y || tx === x + w - 1 || ty === y + h - 1);
}

function inRect([x, y, w, h]: Rect, tx: number, ty: number): boolean {
  return tx >= x && ty >= y && tx < x + w && ty < y + h;
}

function contains(outer: Rect, inner: Rect): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[0] + inner[2] <= outer[0] + outer[2] && inner[1] + inner[3] <= outer[1] + outer[3];
}

function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a[0], b[0]);
  const y = Math.max(a[1], b[1]);
  return [x, y, Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - x), Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - y)];
}

function area([, , w, h]: Rect): number {
  return w * h;
}

function covers(f: FurnitureDef, x: number, y: number): boolean {
  const [w, h] = CATALOG[f.t]?.size ?? [1, 1];
  return x >= f.p[0] && y >= f.p[1] && x < f.p[0] + w && y < f.p[1] + h;
}

function uniqueRoom(level: LevelDef, base: string): string {
  const taken = new Set(level.rooms.map((r) => r.id));
  let n = level.rooms.length;
  while (taken.has(`${level.id}-${base}-${n}`)) n++;
  return `${level.id}-${base}-${n}`;
}
