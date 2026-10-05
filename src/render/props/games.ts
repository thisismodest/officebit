// The mini games' signposts out in the town (docs/GAMES.md): click one to play.
import { OUTLINE } from '../palette.ts';
import { rect } from '../pixels.ts';
import type { Painter } from './common.ts';

const POST = '#6b4a33';
const BOX = '#c89a64';
const TAPE = '#e7c46a';
const RED = '#c8453a';

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
};
