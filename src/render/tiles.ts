// A level's static layer (docs/RENDERING.md): textured floors, walls in 3/4
// view (cap + front face), and the soft shadows walls cast. Painted once.
import type { Grid } from '../sim/grid.ts';
import type { LevelDef, RoomDef } from '../sim/world.ts';
import { BACKGROUND, DEFAULT_FLOOR, FLOORS, WALL, hash, shade, type FloorStyle } from './palette.ts';
import { TILE, canvas, dot, rect, type Ctx } from './pixels.ts';

/** How tall a wall's cap is; the rest of the tile is its front face. */
const CAP = 6;

export function paintStaticLayer(level: LevelDef, grid: Grid): HTMLCanvasElement {
  const { canvas: layer, ctx } = canvas(grid.w * TILE, grid.h * TILE);
  rect(ctx, 0, 0, layer.width, layer.height, BACKGROUND);

  const isWall = (x: number, y: number) => !grid.inBounds(x, y) || grid.wall[grid.i(x, y)] === 1;
  const roomAt = (x: number, y: number): RoomDef | undefined => level.rooms[grid.roomAt(x, y)];
  const floorAt = (x: number, y: number): FloorStyle => FLOORS[roomAt(x, y)?.floor ?? ''] ?? DEFAULT_FLOOR;
  const doors = new Set(level.doors.map(([x, y]) => `${x},${y}`));
  const indoors = level.kind !== 'outside';
  const road = (x: number, y: number) => grid.inBounds(x, y) && CARRIAGEWAY.has(roomAt(x, y)?.floor ?? '');
  const same = (x: number, y: number, kind: FloorStyle['kind']) => !grid.inBounds(x, y) || floorAt(x, y).kind === kind;

  for (let ty = 0; ty < grid.h; ty++) {
    for (let tx = 0; tx < grid.w; tx++) {
      if (indoors && isWall(tx, ty)) continue;
      paintFloor(ctx, tx, ty, floorAt(tx, ty), roomAt(tx, ty), road, same);
      if (!indoors) continue;
      paintWallShadow(ctx, tx, ty, isWall);
      if (doors.has(`${tx},${ty}`)) paintThreshold(ctx, tx, ty, isWall, ty === grid.h - 1);
    }
  }

  if (!indoors) return layer;
  for (let ty = 0; ty < grid.h; ty++) {
    for (let tx = 0; tx < grid.w; tx++) {
      if (!isWall(tx, ty)) continue;
      // A gap in a vertical wall is seen from above: no face over it.
      const verticalDoorBelow = doors.has(`${tx},${ty + 1}`) && isWall(tx, ty + 2);
      const faceBelow = !isWall(tx, ty + 1) && !verticalDoorBelow;
      paintWall(ctx, tx, ty, faceBelow ? wallpaper(floorAt(tx, ty + 1)) : null, isWall);
    }
  }
  return layer;
}

/** Wall faces take a pale tint of the room they face. */
function wallpaper(style: FloorStyle): string {
  const base = style.kind === 'tiles' || style.kind === 'wood' ? style.a : style.base;
  return shade(base, 0.45);
}

/** Floors a road's traffic drives over: where road carries on past a road's edge, it's a bend or a junction. */
const CARRIAGEWAY = new Set(['road', 'zebra', 'zebraSide', 'highway']);

/** `road`: is there carriageway at a tile (for keeping the centre line out of bends and junctions)? `same`: is the floor at a tile of this kind (off the map counts), for banks and railings? */
function paintFloor(
  ctx: Ctx,
  tx: number,
  ty: number,
  style: FloorStyle,
  room: RoomDef | undefined,
  road: (x: number, y: number) => boolean,
  same: (x: number, y: number, kind: FloorStyle['kind']) => boolean,
): void {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const speckle = (base: string, dark: number, light: number, salt: number) => {
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const r = hash(x0 + x, y0 + y, salt);
        if (r < dark) dot(ctx, x0 + x, y0 + y, shade(base, -0.08));
        else if (r > 1 - light) dot(ctx, x0 + x, y0 + y, shade(base, 0.1));
      }
    }
  };

  switch (style.kind) {
    case 'carpet': {
      const base = shade(style.base, (hash(tx, ty) - 0.5) * 0.04);
      rect(ctx, x0, y0, TILE, TILE, base);
      rect(ctx, x0, y0, TILE, 1, shade(base, -0.04));
      rect(ctx, x0, y0, 1, TILE, shade(base, -0.04));
      speckle(base, 0.06, 0.03, 1);
      break;
    }
    case 'tiles': {
      const grout = shade(style.b, -0.12);
      for (let cy = 0; cy < 2; cy++) {
        for (let cx = 0; cx < 2; cx++) {
          const fill = (tx * 2 + cx + ty * 2 + cy) % 2 === 0 ? style.a : style.b;
          const x = x0 + cx * 8;
          const y = y0 + cy * 8;
          rect(ctx, x, y, 8, 8, fill);
          rect(ctx, x + 7, y, 1, 8, grout);
          rect(ctx, x, y + 7, 8, 1, grout);
          dot(ctx, x + 1, y + 1, shade(fill, 0.25));
          dot(ctx, x + 2, y + 1, shade(fill, 0.15));
        }
      }
      break;
    }
    case 'wood': {
      for (let plank = 0; plank < 4; plank++) {
        const row = ty * 4 + plank;
        const fill = hash(row, 0, 3) > 0.5 ? style.a : style.b;
        const y = y0 + plank * 4;
        rect(ctx, x0, y, TILE, 4, fill);
        rect(ctx, x0, y + 3, TILE, 1, shade(style.b, -0.18));
        // Staggered joints, roughly one every couple of tiles.
        if (hash(tx, row, 4) < 0.45) rect(ctx, x0 + Math.floor(hash(tx, row, 5) * TILE), y, 1, 3, shade(style.b, -0.22));
        for (let x = 0; x < TILE; x++) {
          const r = hash(x0 + x, y, 6);
          if (r < 0.12) dot(ctx, x0 + x, y + 1 + (Math.floor(r * 16) % 2), shade(fill, -0.07));
          else if (r > 0.94) dot(ctx, x0 + x, y + 1, shade(fill, 0.08));
        }
      }
      break;
    }
    case 'slabs': {
      rect(ctx, x0, y0, TILE, TILE, style.base);
      speckle(style.base, 0.05, 0.03, 7);
      const joint = shade(style.base, -0.14);
      const { size } = style;
      for (let y = 0; y < TILE; y++) {
        const wy = y0 + y;
        if (wy % size === 0) {
          rect(ctx, x0, wy, TILE, 1, joint);
          continue;
        }
        // Every other course is offset by half a slab, like laid paving.
        const offset = (Math.floor(wy / size) % 2) * (size / 2);
        for (let x = 0; x < TILE; x++) if ((x0 + x + offset) % size === 0) dot(ctx, x0 + x, wy, joint);
      }
      break;
    }
    case 'grass': {
      const base = shade(style.base, (hash(tx, ty, 11) - 0.5) * 0.06);
      rect(ctx, x0, y0, TILE, TILE, base);
      for (let i = 0; i < 7; i++) {
        const x = x0 + Math.floor(hash(tx, ty, 20 + i) * 15);
        const y = y0 + Math.floor(hash(tx, ty, 40 + i) * 14) + 1;
        const light = hash(tx, ty, 60 + i) > 0.5;
        dot(ctx, x, y, shade(base, light ? 0.18 : -0.15));
        dot(ctx, x + 1, y - 1, shade(base, light ? 0.1 : -0.1));
      }
      break;
    }
    case 'road': {
      rect(ctx, x0, y0, TILE, TILE, style.base);
      speckle(style.base, 0.07, 0.04, 9);
      // Dashed centre line down the middle of the road. It carries on past a side road joining it, and stops short
      // where the road itself ends in a bend or a junction (road carrying on past its edges, within its last few tiles).
      if (!room) break;
      const [rx, ry, rw, rh] = room.rect;
      const horizontal = rw >= rh;
      const edge = horizontal ? ry + rh / 2 : rx + rw / 2;
      const atEnd = horizontal ? tx < rx + rh || tx > rx + rw - 1 - rh : ty < ry + rw || ty > ry + rh - 1 - rw;
      const junction = atEnd && (horizontal ? road(tx, ry - 1) || road(tx, ry + rh) : road(rx - 1, ty) || road(rx + rw, ty));
      if (horizontal && ty === edge && tx % 2 === 0 && !junction) rect(ctx, x0 + 2, y0 - 1, 10, 2, '#e8dfae');
      if (!horizontal && tx === edge && ty % 2 === 0 && !junction) rect(ctx, x0 - 1, y0 + 2, 2, 10, '#e8dfae');
      break;
    }
    case 'highway': {
      rect(ctx, x0, y0, TILE, TILE, style.base);
      speckle(style.base, 0.07, 0.04, 9);
      if (!room) break;
      const [, ry, , rh] = room.rect;
      const middle = ry + rh / 2;
      // Like the town's roads, the lines sit on the lanes' edges, clear of the cars in them: solid lines along
      // the outside edges, a solid stripe down the middle, and dashes between the lanes.
      if (ty === ry) rect(ctx, x0, y0, TILE, 1, '#ecebe4');
      if (ty === ry + rh - 1) rect(ctx, x0, y0 + TILE - 1, TILE, 1, '#ecebe4');
      if (ty === middle) rect(ctx, x0, y0 - 1, TILE, 2, '#e8dfae');
      else if (ty !== ry && tx % 3 === 0) rect(ctx, x0 + 2, y0 - 1, 8, 2, '#ecebe4');
      break;
    }
    case 'runway': {
      rect(ctx, x0, y0, TILE, TILE, style.base);
      speckle(style.base, 0.07, 0.04, 9);
      if (!room) break;
      const [rx, ry, rw, rh] = room.rect;
      // Edge lines, a dashed centre line, and threshold stripes across each end (it runs the long way).
      const along = rw >= rh;
      const [first, last] = along ? [tx === rx, tx === rx + rw - 1] : [ty === ry, ty === ry + rh - 1];
      if (along) {
        if (ty === ry) rect(ctx, x0, y0, TILE, 1, '#ecebe4');
        if (ty === ry + rh - 1) rect(ctx, x0, y0 + TILE - 1, TILE, 1, '#ecebe4');
        if (first || last) for (let s = 2; s < TILE; s += 4) rect(ctx, x0 + 3, y0 + s, 10, 2, '#ecebe4');
        else if (ty === ry + Math.floor(rh / 2) && tx % 2 === 0) rect(ctx, x0 + 2, y0 + 7, 10, 2, '#ecebe4');
      } else {
        if (tx === rx) rect(ctx, x0, y0, 1, TILE, '#ecebe4');
        if (tx === rx + rw - 1) rect(ctx, x0 + TILE - 1, y0, 1, TILE, '#ecebe4');
        if (first || last) for (let s = 2; s < TILE; s += 4) rect(ctx, x0 + s, y0 + 3, 2, 10, '#ecebe4');
        else if (tx === rx + Math.floor(rw / 2) && ty % 2 === 0) rect(ctx, x0 + 7, y0 + 2, 2, 10, '#ecebe4');
      }
      break;
    }
    case 'sand': {
      rect(ctx, x0, y0, TILE, TILE, style.base);
      speckle(style.base, 0.12, 0.08, 13);
      break;
    }
    case 'water': {
      rect(ctx, x0, y0, TILE, TILE, style.base);
      // Ripples: short light and dark strokes, a few to a tile.
      for (let i = 0; i < 4; i++) {
        const x = x0 + Math.floor(hash(tx, ty, 80 + i) * 12);
        const y = y0 + Math.floor(hash(tx, ty, 90 + i) * 15);
        rect(ctx, x, y, 3 + Math.floor(hash(tx, ty, 100 + i) * 3), 1, shade(style.base, hash(tx, ty, 110 + i) > 0.5 ? 0.3 : -0.18));
      }
      // The bank: earth and a line of foam where it meets dry land, above (seen from here) and to either side.
      const bank = (x: number, y: number) => !same(x, y, 'water') && !same(x, y, 'bridge');
      if (bank(tx, ty - 1)) {
        rect(ctx, x0, y0, TILE, 3, '#6b5a3e');
        rect(ctx, x0, y0 + 3, TILE, 1, shade(style.base, 0.3));
      }
      if (bank(tx, ty + 1)) rect(ctx, x0, y0 + TILE - 1, TILE, 1, shade(style.base, 0.3));
      if (bank(tx - 1, ty)) rect(ctx, x0, y0, 1, TILE, shade(style.base, 0.3));
      if (bank(tx + 1, ty)) rect(ctx, x0 + TILE - 1, y0, 1, TILE, shade(style.base, 0.3));
      break;
    }
    case 'bridge': {
      // Water beneath, glimpsed at the edges; planks laid across the way you cross; railings along both sides.
      const water = FLOORS.water;
      rect(ctx, x0, y0, TILE, TILE, water?.kind === 'water' ? water.base : style.base);
      const ns = style.across === 'ns';
      for (let i = 0; i < TILE; i += 3) {
        const fill = hash(tx * 7 + i, ty, 12) > 0.5 ? style.base : shade(style.base, -0.08);
        if (ns) rect(ctx, x0 + 1, y0 + i, TILE - 2, 2, fill);
        else rect(ctx, x0 + i, y0 + 1, 2, TILE - 2, fill);
      }
      const rail = shade(style.base, -0.35);
      if (ns) {
        if (!same(tx - 1, ty, 'bridge')) rect(ctx, x0, y0, 2, TILE, rail);
        if (!same(tx + 1, ty, 'bridge')) rect(ctx, x0 + TILE - 2, y0, 2, TILE, rail);
      } else {
        if (!same(tx, ty - 1, 'bridge')) rect(ctx, x0, y0, TILE, 2, rail);
        if (!same(tx, ty + 1, 'bridge')) rect(ctx, x0, y0 + TILE - 2, TILE, 2, rail);
      }
      break;
    }
    case 'zebra': {
      rect(ctx, x0, y0, TILE, TILE, style.base);
      speckle(style.base, 0.07, 0.04, 9);
      // Broad white bars with the traffic, stepped across one after another.
      for (let i = 1; i < TILE; i += 5) {
        if (style.across === 'ns') rect(ctx, x0 + 1, y0 + i, TILE - 2, 3, '#ecebe4');
        else rect(ctx, x0 + i, y0 + 1, 3, TILE - 2, '#ecebe4');
      }
      break;
    }
  }
}

function paintWallShadow(ctx: Ctx, tx: number, ty: number, isWall: (x: number, y: number) => boolean): void {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  if (isWall(tx, ty - 1)) {
    rect(ctx, x0, y0, TILE, 3, 'rgba(20,14,30,0.16)');
    rect(ctx, x0, y0 + 3, TILE, 2, 'rgba(20,14,30,0.07)');
  }
  if (isWall(tx - 1, ty)) rect(ctx, x0, y0, 2, TILE, 'rgba(20,14,30,0.1)');
}

function paintThreshold(ctx: Ctx, tx: number, ty: number, isWall: (x: number, y: number) => boolean, frontDoor: boolean): void {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  if (frontDoor) {
    // Doormat
    rect(ctx, x0, y0 + 3, TILE, 11, '#6e4a36');
    rect(ctx, x0, y0 + 4, TILE, 9, '#8c5f43');
    for (let x = 1; x < TILE; x += 3) rect(ctx, x0 + x, y0 + 5, 1, 7, '#7a523a');
    return;
  }
  if (isWall(tx - 1, ty) && isWall(tx + 1, ty)) {
    // Threshold strip across a doorway in a horizontal wall.
    rect(ctx, x0, y0 + TILE - 3, TILE, 2, '#9c8b78');
    rect(ctx, x0, y0 + TILE - 3, TILE, 1, '#b3a38f');
  }
}

function paintWall(ctx: Ctx, tx: number, ty: number, face: string | null, isWall: (x: number, y: number) => boolean): void {
  const x0 = tx * TILE;
  const y0 = ty * TILE;
  const capH = face ? CAP : TILE;

  rect(ctx, x0, y0, TILE, capH, WALL.cap);
  // Bevel the cap where it meets open floor.
  if (!isWall(tx, ty - 1)) {
    rect(ctx, x0, y0, TILE, 1, WALL.capDark);
    rect(ctx, x0, y0 + 1, TILE, 1, WALL.capLight);
  }
  if (!isWall(tx - 1, ty)) {
    rect(ctx, x0, y0, 1, capH, WALL.capDark);
    rect(ctx, x0 + 1, y0, 1, capH, WALL.capLight);
  }
  if (!isWall(tx + 1, ty)) rect(ctx, x0 + TILE - 1, y0, 1, capH, WALL.capDark);
  if (!face && !isWall(tx, ty + 1)) rect(ctx, x0, y0 + TILE - 1, TILE, 1, WALL.capDark);
  if (!face) return;

  // Front face: wallpaper tinted to the room, stripes, and a skirting board.
  const faceH = TILE - CAP;
  const fy = y0 + CAP;
  rect(ctx, x0, fy, TILE, faceH, face);
  for (let x = 1; x < TILE; x += 4) rect(ctx, x0 + x, fy + 1, 1, faceH - 4, shade(face, -0.06));
  rect(ctx, x0, fy, TILE, 1, shade(face, -0.3));
  rect(ctx, x0, y0 + TILE - 3, TILE, 1, shade(WALL.skirting, 0.2));
  rect(ctx, x0, y0 + TILE - 2, TILE, 2, WALL.skirting);
  if (!isWall(tx - 1, ty)) rect(ctx, x0, fy, 1, faceH, shade(face, -0.25));
  if (!isWall(tx + 1, ty)) rect(ctx, x0 + TILE - 1, fy, 1, faceH, shade(face, -0.25));
}
