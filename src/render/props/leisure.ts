// Leisure centre art (docs/BUILDINGS.md#venues): the building from outside, and the pool, the gym and reception inside.
import { OUTLINE, shade } from '../palette.ts';
import { TILE, dot, pill, rect } from '../pixels.ts';
import { METAL, WINDOW_LIT, counterBase, type Painter } from './common.ts';
import { sign } from './venue.ts';

const WALL = '#e9eef0';
const BLUE = '#2f7fb8';
const WATER = '#5bb3d9';
const DOOR_X = 5 * TILE;

/** The long glass front: [x, width] of each pane, clear of the doors. */
const PANES: [number, number][] = [[6, 30], [40, 30], [DOOR_X + 2 * TILE + 6, 30], [DOOR_X + 2 * TILE + 40, 30]];
const facadeTop = (o: number, h: number) => o + h - 38;

export const LEISURE: Record<string, Painter> = {
  leisureCentre: {
    up: 12,
    paint(ctx, w, h, o) {
      const top = facadeTop(o, h);
      // A shallow curved roof in blue, the sign along its front.
      rect(ctx, 0, o - 4, w, top - o + 5, OUTLINE);
      rect(ctx, 1, o - 3, w - 2, top - o + 3, BLUE);
      for (let y = o; y < top; y += 5) rect(ctx, 1, y, w - 2, 1, shade(BLUE, 0.15));
      rect(ctx, w / 2 - 20, o - 12, 40, 10, OUTLINE);
      rect(ctx, w / 2 - 19, o - 11, 38, 8, WALL);
      sign(ctx, 'LEISURE', w / 2 - 14, o - 10, BLUE);
      // White walls, a band of glass, the doors under a canopy.
      rect(ctx, 1, top, w - 2, o + h - top, OUTLINE);
      rect(ctx, 2, top, w - 4, o + h - top - 1, WALL);
      rect(ctx, 2, top + 2, w - 4, 2, WATER);
      for (const [x, pw] of PANES) {
        rect(ctx, x, top + 8, pw, 22, OUTLINE);
        rect(ctx, x + 1, top + 9, pw - 2, 20, '#7fb6d6');
        rect(ctx, x + 1, top + 9, pw - 2, 3, '#b8dcee');
      }
      rect(ctx, DOOR_X - 2, o + h - 24, 2 * TILE + 4, 24, OUTLINE);
      rect(ctx, DOOR_X, o + h - 22, 2 * TILE, 22, '#6d9fc0');
      rect(ctx, DOOR_X + TILE - 1, o + h - 22, 2, 22, OUTLINE);
      rect(ctx, DOOR_X - 6, o + h - 28, 2 * TILE + 12, 4, BLUE);
      rect(ctx, 2, o + h - 3, w - 4, 2, shade(WALL, -0.2));
    },
    lit(ctx, _w, h, o) {
      for (const [x, pw] of PANES) rect(ctx, x + 1, facadeTop(o, h) + 9, pw - 2, 20, WINDOW_LIT);
    },
  },

  // Lanes of blue water in a tiled surround, a ladder at each end.
  pool: {
    up: 0,
    flat: true,
    paint(ctx, w, h, o) {
      rect(ctx, 0, o, w, h, OUTLINE);
      rect(ctx, 1, o + 1, w - 2, h - 2, '#dfe9ec');
      rect(ctx, 3, o + 3, w - 6, h - 6, BLUE);
      rect(ctx, 4, o + 4, w - 8, h - 8, WATER);
      for (let y = o + 4 + 12; y < o + h - 6; y += 12) for (let x = 6; x < w - 6; x += 6) rect(ctx, x, y, 3, 1, x % 12 ? '#e94f4f' : '#f4f4f4');
      for (let i = 0; i < 6; i++) rect(ctx, 12 + i * 24, o + 9 + (i % 3) * 13, 7, 1, '#a8dcf0');
      for (const x of [6, w - 10]) {
        rect(ctx, x, o + 2, 1, 6, METAL.mid);
        rect(ctx, x + 3, o + 2, 1, 6, METAL.mid);
      }
    },
  },

  treadmill: {
    up: 10,
    paint(ctx, w, h, o) {
      // The console up front, the belt running back.
      rect(ctx, 2, o - 10, w - 4, 8, OUTLINE);
      rect(ctx, 3, o - 9, w - 6, 6, '#3a3f4a');
      dot(ctx, 5, o - 7, '#5fd36a');
      rect(ctx, 3, o - 2, 1, 6, METAL.dark);
      rect(ctx, w - 4, o - 2, 1, 6, METAL.dark);
      rect(ctx, 2, o + 2, w - 4, h - 4, OUTLINE);
      rect(ctx, 3, o + 3, w - 6, h - 6, '#2b2e36');
      for (let y = o + 5; y < o + h - 4; y += 3) rect(ctx, 4, y, w - 8, 1, '#3c404a');
    },
  },

  weightBench: {
    up: 6,
    paint(ctx, w, _h, o) {
      // The padded bench, and a barbell on its rack across it.
      rect(ctx, 4, o + 4, w - 8, 7, OUTLINE);
      rect(ctx, 5, o + 5, w - 10, 5, '#c8453a');
      rect(ctx, 6, o + 11, 2, 4, OUTLINE);
      rect(ctx, w - 8, o + 11, 2, 4, OUTLINE);
      rect(ctx, 2, o - 2, w - 4, 2, METAL.dark);
      for (const x of [1, w - 5]) pill(ctx, x, o - 6, 4, 10, '#2b2e36', OUTLINE);
    },
  },

  reception: {
    up: 4,
    paint(ctx, w, h, o) {
      counterBase(ctx, w, h, o);
      rect(ctx, w / 2 - 6, o - 4, 12, 8, OUTLINE);
      rect(ctx, w / 2 - 5, o - 3, 10, 6, '#3a4250');
      rect(ctx, 4, o + 3, 6, 2, BLUE);
    },
  },
};
