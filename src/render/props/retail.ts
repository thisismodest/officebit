// The retail park's art (docs/BUILDINGS.md#venues): the garden centre and the parcel depot, outside and in.
import { OUTLINE, hash, shade } from '../palette.ts';
import { TILE, dot, pill, rect, type Ctx } from '../pixels.ts';
import { METAL, WOOD, type Painter } from './common.ts';
import { sign } from './venue.ts';

const GLASS = '#cfe6d2';
const FRAME = '#f4f4f0';
const LEAVES = ['#4f8a3c', '#5f9e4a', '#3f7a32'];
const BLOOMS = ['#e98fb3', '#f3c64a', '#e94f4f', '#9fb3e8', '#f4f4f4'];
const BOXES = ['#c89a64', '#b5874f', '#d7ad78'];

/** A pot with a plant in it, its leaves (and maybe a flower) from the seed. */
function pot(ctx: Ctx, x: number, y: number, seed: number): void {
  rect(ctx, x, y + 3, 4, 3, '#b0623d');
  rect(ctx, x, y + 3, 4, 1, '#c8794f');
  pill(ctx, x - 1, y - 2, 6, 6, LEAVES[Math.floor(seed * LEAVES.length)]!);
  if (seed > 0.4) dot(ctx, x + 1 + Math.floor(seed * 3), y - 1, BLOOMS[Math.floor(hash(seed * 99, 2) * BLOOMS.length)]!);
}

export const RETAIL: Record<string, Painter> = {
  // A glasshouse on a brick base: glass walls and a glass roof in white frames, the sign on the gable, and glass doors.
  gardenCentre: {
    up: 18,
    paint(ctx, w, h, o) {
      const eaves = o + h - 40;
      const ridge = o - 16;
      // The roof, glass between glazing bars, narrowing to the ridge.
      for (let y = ridge; y < eaves; y++) {
        const inset = Math.max(0, 10 - (y - ridge));
        rect(ctx, inset, y, w - inset * 2, 1, (y - ridge) % 5 === 0 ? FRAME : shade(GLASS, -0.05));
        dot(ctx, inset, y, OUTLINE);
        dot(ctx, w - inset - 1, y, OUTLINE);
      }
      rect(ctx, 10, ridge, w - 20, 1, OUTLINE);
      for (let x = 14; x < w - 14; x += 12) rect(ctx, x, ridge + 1, 1, eaves - ridge - 1, FRAME);
      // Glass walls on a low brick wall.
      rect(ctx, 0, eaves, w, o + h - eaves, OUTLINE);
      rect(ctx, 1, eaves + 1, w - 2, o + h - eaves - 9, GLASS);
      for (let x = 1; x < w - 1; x += 8) rect(ctx, x, eaves + 1, 1, o + h - eaves - 9, FRAME);
      rect(ctx, 1, eaves + 14, w - 2, 1, FRAME);
      for (let i = 0; i < 9; i++) pot(ctx, 6 + i * 24, eaves + 16, hash(i, 7));
      rect(ctx, 1, o + h - 8, w - 2, 7, '#a65c43');
      for (let y = o + h - 8; y < o + h - 1; y += 3) rect(ctx, 1, y, w - 2, 1, shade('#a65c43', -0.15));
      // The sign, and the doors.
      rect(ctx, w / 2 - 26, eaves - 8, 52, 9, OUTLINE);
      rect(ctx, w / 2 - 25, eaves - 7, 50, 7, '#2f5d3a');
      sign(ctx, 'GARDEN', w / 2 - 12, eaves - 6, '#f4ecd8');
      const door = 6 * TILE;
      rect(ctx, door - 2, o + h - 24, TILE + 4, 24, OUTLINE);
      rect(ctx, door, o + h - 22, TILE, 22, '#a9d4b8');
      rect(ctx, door + TILE / 2, o + h - 22, 1, 22, OUTLINE);
    },
    lit(ctx, w, h, o) {
      const eaves = o + h - 40;
      for (let x = 2; x < w - 2; x += 8) rect(ctx, x, eaves + 2, 6, 10, 'rgba(255,217,138,0.6)');
    },
  },

  // A warehouse in grey cladding: two roller shutters, a door, and the sign along the top.
  depot: {
    up: 10,
    paint(ctx, w, h, o) {
      const clad = '#9aa2ab';
      rect(ctx, 0, o - 10, w, h + 10, OUTLINE);
      rect(ctx, 1, o - 9, w - 2, 8, '#6f7780');
      rect(ctx, 1, o - 1, w - 2, h, clad);
      for (let y = o + 1; y < o + h - 1; y += 3) rect(ctx, 1, y, w - 2, 1, shade(clad, -0.1));
      rect(ctx, w / 2 - 22, o + 2, 44, 9, OUTLINE);
      rect(ctx, w / 2 - 21, o + 3, 42, 7, '#c8453a');
      sign(ctx, 'PARCELS', w / 2 - 14, o + 4, '#f4f4f0');
      for (const x of [8, w - 40]) {
        rect(ctx, x, o + h - 30, 32, 30, OUTLINE);
        rect(ctx, x + 1, o + h - 29, 30, 29, METAL.mid);
        for (let y = o + h - 27; y < o + h - 1; y += 3) rect(ctx, x + 1, y, 30, 1, METAL.dark);
      }
      const door = 5 * TILE;
      rect(ctx, door + 2, o + h - 22, 12, 22, OUTLINE);
      rect(ctx, door + 3, o + h - 21, 10, 21, '#3f5a7a');
      dot(ctx, door + 11, o + h - 11, '#e7c14a');
    },
    lit(ctx, w, _h, o) {
      rect(ctx, w / 2 - 21, o + 3, 42, 7, '#ff8a7a');
    },
  },

  // A slatted table of potted plants.
  plantTable: {
    up: 8,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 0, o + 2, w, h - 4, OUTLINE);
      rect(ctx, 1, o + 3, w - 2, h - 7, WOOD.top);
      for (let x = 3; x < w - 2; x += 4) rect(ctx, x, o + 3, 1, h - 7, WOOD.dark);
      rect(ctx, 2, o + h - 4, 2, 4, OUTLINE);
      rect(ctx, w - 4, o + h - 4, 2, 4, OUTLINE);
      for (let i = 0; i < 5; i++) pot(ctx, 3 + i * 9, o - 2 + (i % 2) * 3, hash(i, seed * 50));
    },
  },

  // A rack of seed packets.
  seedRack: {
    up: 14,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 1, o - 14, w - 2, h + 12, OUTLINE);
      rect(ctx, 2, o - 13, w - 4, h + 10, '#e8dcc4');
      for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) rect(ctx, 4 + x * 5, o - 11 + y * 6, 4, 5, BLOOMS[Math.floor(hash(x, y, seed * 9) * BLOOMS.length)]!);
    },
  },

  // Plants on a two-tier stand, out in the yard.
  plantStand: {
    up: 10,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 1, o + 4, w - 2, 3, OUTLINE);
      rect(ctx, 2, o + 5, w - 4, 1, WOOD.top);
      rect(ctx, 4, o - 2, w - 8, 3, OUTLINE);
      rect(ctx, 5, o - 1, w - 10, 1, WOOD.top);
      for (let i = 0; i < 4; i++) pot(ctx, 4 + i * 7, o + 1, hash(i, seed * 30));
      for (let i = 0; i < 3; i++) pot(ctx, 8 + i * 7, o - 6, hash(i, seed * 40 + 1));
      rect(ctx, 2, o + 7, 2, h - 8, OUTLINE);
      rect(ctx, w - 4, o + 7, 2, h - 8, OUTLINE);
    },
  },

  // Shelves stacked with parcels.
  parcelShelf: {
    up: 14,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 0, o - 14, w, h + 12, OUTLINE);
      rect(ctx, 1, o - 13, w - 2, h + 10, METAL.dark);
      for (const y of [o - 12, o - 4, o + 4]) {
        rect(ctx, 1, y + 6, w - 2, 1, METAL.light);
        for (let x = 2; x < w - 4; ) {
          const bw = 5 + Math.floor(hash(x, y, seed * 7) * 5);
          rect(ctx, x, y + 6 - Math.min(6, bw), Math.min(bw, w - 2 - x), Math.min(6, bw), BOXES[Math.floor(hash(y, x, seed) * BOXES.length)]!);
          x += bw + 1;
        }
      }
    },
  },

  // The sorting table, piled with parcels to go out.
  sortingTable: {
    up: 6,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 0, o, w, h - 2, OUTLINE);
      rect(ctx, 1, o + 1, w - 2, 4, METAL.light);
      rect(ctx, 1, o + 5, w - 2, h - 8, METAL.mid);
      for (let i = 0; i < 4; i++) rect(ctx, 4 + i * 10, o - 4 + (i % 2) * 2, 7, 6, BOXES[Math.floor(hash(i, seed * 11) * BOXES.length)]!);
    },
  },

  // Where the van stands: a long box painted on the concrete, open at the top (where it drives in from), with a stop line at the far end.
  loadingBay: {
    up: 0,
    flat: true,
    paint(ctx, w, h, o) {
      const yellow = '#e7c14a';
      rect(ctx, 0, o, 1, h, yellow);
      rect(ctx, w - 1, o, 1, h, yellow);
      rect(ctx, 0, o + h - 2, w, 2, yellow);
      for (let x = 3; x < w - 2; x += 4) dot(ctx, x, o + 1, yellow);
    },
  },
};

