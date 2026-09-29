// School art: the building, classroom furniture, the canteen and the playground.
import { OUTLINE, hash, shade } from '../palette.ts';
import { TILE, dot, pill, rect, type Ctx } from '../pixels.ts';
import { METAL, WINDOW_LIT, WOOD, chair, deskBase, paper, type Painter } from './common.ts';
import { sign } from './venue.ts';

const BRICK = '#b5523b';
const MORTAR = '#d9b8a0';
const BOARD = '#2f5140';
const CHALK = '#e8efe9';
const APPLE = '#d9434f';
/** Where the school's windows sit along its front, as tile columns. */
const SCHOOL_WINDOWS = [1, 3, 7, 9];

export const SCHOOL: Record<string, Painter> = {
  school: {
    up: 16,
    paint(ctx, w, h, o) {
      const top = o + h - 56;
      // Slate roof with a little bell tower in the middle.
      rect(ctx, 0, o - 4, w, top - o + 5, OUTLINE);
      rect(ctx, 1, o - 3, w - 2, top - o + 3, '#5d6474');
      for (let y = o; y < top; y += 5) rect(ctx, 1, y, w - 2, 1, '#4b5160');
      rect(ctx, w / 2 - 7, o - 16, 14, 14, OUTLINE);
      rect(ctx, w / 2 - 6, o - 15, 12, 12, MORTAR);
      rect(ctx, w / 2 - 3, o - 12, 6, 6, '#e7aa2e');
      // Red brick front
      rect(ctx, 1, top, w - 2, o + h - top, OUTLINE);
      rect(ctx, 2, top, w - 4, o + h - top - 1, BRICK);
      for (let y = top + 3; y < o + h - 2; y += 4) {
        rect(ctx, 2, y, w - 4, 1, shade(BRICK, -0.15));
        for (let x = 2 + ((y / 4) % 2) * 4; x < w - 2; x += 8) dot(ctx, x, y - 2, shade(BRICK, -0.15));
      }
      // The name board over the door
      rect(ctx, w / 2 - 15, top + 3, 30, 9, OUTLINE);
      rect(ctx, w / 2 - 14, top + 4, 28, 7, '#f4ecd8');
      sign(ctx, 'SCHOOL', w / 2 - 12, top + 5, '#2f5f9e');
      for (const col of SCHOOL_WINDOWS) schoolWindow(ctx, col * TILE + 2, top + 18, false);
      // Double doors on the door tile, with a step.
      const door = 5 * TILE;
      rect(ctx, door - 2, top + 16, TILE + 4, o + h - top - 16, OUTLINE);
      rect(ctx, door - 1, top + 17, TILE + 2, o + h - top - 19, '#2f5f9e');
      rect(ctx, door + TILE / 2, top + 17, 1, o + h - top - 19, OUTLINE);
      rect(ctx, door + 2, top + 20, 4, 6, '#b5d0e6');
      rect(ctx, door + 10, top + 20, 4, 6, '#b5d0e6');
      rect(ctx, door - 3, o + h - 3, TILE + 6, 2, METAL.mid);
    },
    lit(ctx, _w, h, o) {
      for (const col of SCHOOL_WINDOWS) schoolWindow(ctx, col * TILE + 2, o + h - 56 + 18, true);
    },
  },

  schoolDesk: {
    up: 8,
    down: TILE,
    paint(ctx, w, h, o, seed) {
      deskBase(ctx, w, h, o);
      paper(ctx, 3, o + 2, 6, 5);
      // A pencil, and sometimes a crayon drawing.
      rect(ctx, 10, o + 3, 1, 5, '#e7aa2e');
      dot(ctx, 10, o + 8, OUTLINE);
      if (seed > 0.5) rect(ctx, 4, o + 3, 3, 2, ['#e98fb3', '#7fd1ff', '#9be38a'][Math.floor(seed * 3)]!);
      chair(ctx, 0, o + h, '#e4793a');
    },
  },

  teacherDesk: {
    up: 8,
    paint(ctx, w, h, o) {
      deskBase(ctx, w, h, o, WOOD);
      // A pile of exercise books and an apple.
      for (let i = 0; i < 3; i++) rect(ctx, 4, o + 5 - i * 2, 9, 2, ['#3f74b5', '#c8453a', '#379463'][i]!);
      pill(ctx, w - 10, o + 2, 5, 5, APPLE, OUTLINE);
      dot(ctx, w - 8, o + 1, '#379463');
    },
  },

  blackboard: {
    up: 14,
    paint(ctx, w, _h, o, seed) {
      rect(ctx, 1, o - 14, w - 2, 20, '#6b4a33');
      rect(ctx, 3, o - 12, w - 6, 16, BOARD);
      // Sums and a wobbly sun.
      for (let line = 0; line < 3; line++) {
        const end = 10 + Math.floor(hash(line, 0, seed * 7) * 14);
        for (let x = 6; x < end; x += 3) rect(ctx, x, o - 9 + line * 4, 2, 1, CHALK);
      }
      pill(ctx, w - 14, o - 10, 7, 7, '#f3c969');
      rect(ctx, 2, o + 5, w - 4, 2, '#8a5e3f');
      rect(ctx, 6, o + 4, 3, 1, CHALK);
    },
  },

  canteenTable: {
    up: 3,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 3, o + h - 4, 2, 4, METAL.line);
      rect(ctx, w - 5, o + h - 4, 2, 4, METAL.line);
      pill(ctx, 0, o - 1, w, h - 2, '#dfe6ea', METAL.dark);
      rect(ctx, 2, o, w - 4, 1, '#f4f7f8');
      // Lunch trays
      for (let x = 4; x < w - 8; x += 14) {
        rect(ctx, x, o + 2, 9, 6, METAL.mid);
        dot(ctx, x + 2, o + 4, hash(x, 1, seed) > 0.5 ? APPLE : '#e7aa2e');
        rect(ctx, x + 4, o + 4, 3, 2, '#c98b4a');
      }
    },
  },

  swings: {
    up: 20,
    sortOffset: -8,
    paint(ctx, w, h, o) {
      const bar = o - 18;
      // A-frame posts at either end, a top bar, and two seats on chains.
      for (const x of [1, w - 4]) {
        rect(ctx, x, bar, 3, h + 18, OUTLINE);
        rect(ctx, x + 1, bar + 1, 1, h + 16, '#3f74b5');
      }
      rect(ctx, 1, bar, w - 2, 3, OUTLINE);
      rect(ctx, 2, bar + 1, w - 4, 1, '#5b8fd1');
      for (const x of [3, w - 13]) {
        const seat = o + TILE + 6;
        rect(ctx, x + 1, bar + 3, 1, seat - bar - 3, METAL.dark);
        rect(ctx, x + 8, bar + 3, 1, seat - bar - 3, METAL.dark);
        rect(ctx, x, seat, 10, 3, OUTLINE);
        rect(ctx, x + 1, seat, 8, 2, '#c8453a');
      }
    },
  },

  hopscotch: {
    up: 0,
    flat: true,
    paint(ctx, w, h, o) {
      const squares = 4;
      const size = Math.floor(h / squares) - 1;
      for (let i = 0; i < squares; i++) {
        const y = o + 1 + i * (size + 1);
        rect(ctx, 2, y, w - 4, size, CHALK);
        rect(ctx, 3, y + 1, w - 6, size - 2, '#a9adb2');
        dot(ctx, w / 2, y + size / 2, i % 2 ? '#e98fb3' : '#7fd1ff');
      }
    },
  },
};

function schoolWindow(ctx: Ctx, x: number, y: number, lit: boolean): void {
  rect(ctx, x, y, 28, 18, '#f4ecd8');
  rect(ctx, x + 2, y + 2, 24, 14, lit ? WINDOW_LIT : '#7fa6c9');
  rect(ctx, x + 13, y + 2, 2, 14, '#f4ecd8');
  rect(ctx, x + 2, y + 8, 24, 1, '#f4ecd8');
  if (!lit) rect(ctx, x + 3, y + 3, 3, 4, '#b5d0e6');
}
