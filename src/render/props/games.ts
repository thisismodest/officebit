// The mini games' signposts out in the town (docs/GAMES.md): click one to play.
import { OUTLINE } from '../palette.ts';
import { rect } from '../pixels.ts';
import type { Painter } from './common.ts';

const POST = '#6b4a33';
const BOX = '#c89a64';
const TAPE = '#e7c46a';
const RED = '#c8453a';
const CORK = '#b88a5a';
const PAPER = '#f4f0e6';
const GOLD = '#f3c969';

export const GAMES: Record<string, Painter> = {
  // Parcel Dash: a red sign on a post, a parcel on it with speed lines, and a star to say "play me".
  parcelDash: {
    up: 18,
    paint(ctx, w, h, o) {
      const mid = w / 2;
      rect(ctx, mid - 1, o - 6, 2, h + 4, POST);
      rect(ctx, mid - 7, o - 17, 14, 11, OUTLINE);
      rect(ctx, mid - 6, o - 16, 12, 9, RED);
      // The parcel, taped, with speed lines behind it.
      rect(ctx, mid - 2, o - 14, 6, 5, OUTLINE);
      rect(ctx, mid - 1, o - 13, 4, 3, BOX);
      rect(ctx, mid, o - 13, 1, 3, TAPE);
      rect(ctx, mid - 5, o - 13, 2, 1, '#f4f4f0');
      rect(ctx, mid - 5, o - 11, 2, 1, '#f4f4f0');
      rect(ctx, mid + 4, o - 18, 2, 2, '#f3c969');
    },
  },
  // Find it: a noticeboard on two posts, papers pinned to it, and a magnifying glass.
  findIt: {
    up: 20,
    paint(ctx, w, h, o) {
      const mid = w / 2;
      rect(ctx, mid - 6, o - 6, 2, h + 4, POST);
      rect(ctx, mid + 4, o - 6, 2, h + 4, POST);
      rect(ctx, mid - 8, o - 18, 16, 12, OUTLINE);
      rect(ctx, mid - 7, o - 17, 14, 10, CORK);
      // Papers, each with a pin, and lines of writing.
      rect(ctx, mid - 6, o - 16, 5, 6, PAPER);
      rect(ctx, mid - 5, o - 14, 3, 1, '#9a948a');
      rect(ctx, mid - 5, o - 12, 3, 1, '#9a948a');
      rect(ctx, mid - 4, o - 17, 1, 1, RED);
      rect(ctx, mid, o - 15, 4, 5, PAPER);
      rect(ctx, mid + 2, o - 16, 1, 1, '#4f8fd6');
      // The glass: a ring and a handle.
      rect(ctx, mid + 1, o - 14, 3, 3, OUTLINE);
      rect(ctx, mid + 2, o - 13, 1, 1, '#cfe8f5');
      rect(ctx, mid + 4, o - 11, 1, 1, OUTLINE);
      rect(ctx, mid + 5, o - 19, 2, 2, GOLD);
    },
  },
  // Catch!: a tub of balls, red, blue and yellow, on the grass.
  ballTub: {
    up: 6,
    paint(ctx, w, h, o) {
      const mid = w / 2;
      rect(ctx, mid - 6, o + h - 10, 12, 9, OUTLINE);
      rect(ctx, mid - 5, o + h - 9, 10, 7, '#4f8fd6');
      rect(ctx, mid - 5, o + h - 7, 10, 1, '#3a6fae');
      // Balls heaped up out of the top.
      for (const [dx, dy, colour] of [[-4, -13, RED], [-1, -14, GOLD], [2, -13, '#5fb35a'], [-2, -16, '#4f8fd6'], [1, -17, RED]] as const) {
        rect(ctx, mid + dx, o + h + dy, 4, 4, OUTLINE);
        rect(ctx, mid + dx + 1, o + h + dy + 1, 2, 2, colour);
      }
    },
  },
};
