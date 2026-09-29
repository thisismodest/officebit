// Tiles, rectangles and footprints (docs/BUILDINGS.md): the bits of geometry
// the sim, the world builders and the editor share.
import { CATALOG } from './catalog.ts';
import type { FurnitureDef, LevelDef, Place, PortalDef, Rect, Tile } from './world.ts';

export function inRect([rx, ry, rw, rh]: Rect, x: number, y: number): boolean {
  return x >= rx && y >= ry && x < rx + rw && y < ry + rh;
}

/** Is the tile on the rectangle's edge (where a room's wall is)? */
export function onEdge([x, y, w, h]: Rect, tx: number, ty: number): boolean {
  return inRect([x, y, w, h], tx, ty) && (tx === x || ty === y || tx === x + w - 1 || ty === y + h - 1);
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[0] + inner[2] <= outer[0] + outer[2] && inner[1] + inner[3] <= outer[1] + outer[3];
}

export function overlap([ax, ay, aw, ah]: Rect, [bx, by, bw, bh]: Rect): boolean {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

export function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a[0], b[0]);
  const y = Math.max(a[1], b[1]);
  return [x, y, Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - x), Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - y)];
}

export function area([, , w, h]: Rect): number {
  return w * h;
}

/** Every tile a rectangle covers, row by row. */
export function tilesIn([x, y, w, h]: Rect): Tile[] {
  return Array.from({ length: w * h }, (_, i): Tile => [x + (i % w), y + Math.floor(i / w)]);
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function manhattan(a: Tile, b: Tile): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
}

/** Where a piece of furniture stands: its corner, and its size from the catalog. */
export function footprint(f: FurnitureDef): Rect {
  const [w, h] = CATALOG[f.t]?.size ?? [1, 1];
  return [f.p[0], f.p[1], w, h];
}

export function covers(f: FurnitureDef, x: number, y: number): boolean {
  return inRect(footprint(f), x, y);
}

/** Is a tile on the row just in front of a building (below it, or above if it faces up), within its width? A door there leads in. */
export function atDoorOf(f: FurnitureDef, [x, y]: Tile): boolean {
  const [fx, fy, w, h] = footprint(f);
  return y === (f.faces === 'up' ? fy - 1 : fy + h) && x >= fx && x < fx + w;
}

/** The tile in front of a building's door. */
export function doorOf(f: FurnitureDef): Tile {
  const [fx, fy, w, h] = footprint(f);
  return [fx + Math.min(1, w - 1), f.faces === 'up' ? fy - 1 : fy + h];
}

/** The ends of doors and stairs that are on a level, in portal order. */
export function endsOn(portals: readonly PortalDef[], level: string): Place[] {
  return portals.flatMap((p) => [p.a, p.b]).filter((end) => end.level === level);
}

/** A portal both ways round: [this end, the other end]. */
export function sides({ a, b }: PortalDef): readonly (readonly [Place, Place])[] {
  return [
    [a, b],
    [b, a],
  ];
}

/** A room id no room on the level has yet: `base-n`. */
export function freeRoomId(level: LevelDef, base: string): string {
  const taken = new Set(level.rooms.map((r) => r.id));
  let n = level.rooms.length;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
