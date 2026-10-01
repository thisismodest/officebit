// Airfield art (docs/TRAFFIC.md#planes): the little plane, its stand, the gate passengers wait at, a hangar, a windsock.
import { OUTLINE, shade } from '../palette.ts';
import { dot, pill, rect, type Ctx } from '../pixels.ts';
import { METAL, WINDOW_LIT, type Painter } from './common.ts';

const BODY = '#f2f1ec';
const STRIPE = '#c8453a';
const WING = '#d9d7cf';

/** The plane facing right, a little from above: wings across its middle, the tail fin up at the back, the propeller at the nose. */
export function paintPlane(ctx: Ctx, w: number, h: number, o: number): void {
  const mid = o + Math.floor(h / 2);
  // The far wing (up the screen), the fuselage, then the near wing over it.
  rect(ctx, w / 2 - 6, o - 6, 12, 10, OUTLINE);
  rect(ctx, w / 2 - 5, o - 5, 10, 8, WING);
  pill(ctx, 6, mid - 6, w - 12, 12, BODY, OUTLINE);
  rect(ctx, 8, mid, w - 18, 2, STRIPE);
  // Windows along the cabin, the windscreen at the front.
  for (let x = 20; x < w - 22; x += 6) rect(ctx, x, mid - 3, 3, 2, '#5d7a99');
  rect(ctx, w - 18, mid - 4, 5, 3, '#8fb0cc');
  // Tail: the fin up at the back, and the tailplane.
  rect(ctx, 4, mid - 14, 8, 10, OUTLINE);
  rect(ctx, 5, mid - 13, 6, 8, BODY);
  rect(ctx, 5, mid - 9, 6, 2, STRIPE);
  rect(ctx, 2, mid - 2, 10, 3, OUTLINE);
  rect(ctx, 3, mid - 1, 8, 1, WING);
  // The nose and its propeller.
  rect(ctx, w - 7, mid - 2, 3, 4, METAL.dark);
  rect(ctx, w - 4, mid - 7, 2, 14, shade(METAL.dark, -0.3));
  rect(ctx, w / 2 - 7, mid + 4, 14, 10, OUTLINE);
  rect(ctx, w / 2 - 6, mid + 5, 12, 8, shade(WING, -0.08));
  rect(ctx, w / 2 - 6, mid + 5, 12, 1, shade(WING, 0.1));
  // Wheels under it.
  for (const x of [w / 2 - 6, w / 2 + 4, w - 12]) rect(ctx, x, o + h - 3, 3, 3, OUTLINE);
}

export const AIRFIELD: Record<string, Painter> = {
  plane: {
    up: 10,
    paint(ctx, w, h, o) {
      rect(ctx, 8, o + h - 3, w - 16, 3, 'rgba(20,14,30,0.2)');
      paintPlane(ctx, w, h, o);
    },
  },

  // Where the plane parks: a yellow box painted on the apron, with a line leading in.
  stand: {
    up: 0,
    flat: true,
    paint(ctx, w, h, o) {
      const yellow = '#e7c14a';
      rect(ctx, 1, o + 1, w - 2, 1, yellow);
      rect(ctx, 1, o + h - 2, w - 2, 1, yellow);
      rect(ctx, 1, o + 1, 1, h - 2, yellow);
      rect(ctx, w - 2, o + 1, 1, h - 2, yellow);
      for (let x = 4; x < w - 4; x += 6) rect(ctx, x, o + h / 2, 3, 1, yellow);
    },
  },

  // A gate: a bench under a little canopy, and a sign on a post with the field's name (its departures board).
  gate: {
    up: 26,
    paint(ctx, w, h, o) {
      rect(ctx, 2, o + h - 3, w - 4, 3, 'rgba(20,14,30,0.2)');
      // Canopy on two posts.
      for (const x of [2, w - 5]) rect(ctx, x, o - 18, 3, h + 16, OUTLINE);
      rect(ctx, 0, o - 22, w, 5, OUTLINE);
      rect(ctx, 1, o - 21, w - 2, 3, '#3f74b5');
      // The bench.
      rect(ctx, 5, o + 4, w - 18, 4, OUTLINE);
      rect(ctx, 6, o + 5, w - 20, 2, '#b98452');
      // The departures board.
      rect(ctx, w - 12, o - 14, 9, 8, OUTLINE);
      rect(ctx, w - 11, o - 13, 7, 6, '#24303d');
      for (let y = o - 12; y < o - 8; y += 2) rect(ctx, w - 10, y, 5, 1, '#e7c14a');
      rect(ctx, w - 8, o - 6, 2, h + 4, OUTLINE);
    },
    lit(ctx, w, _h, o) {
      rect(ctx, w - 11, o - 13, 7, 6, WINDOW_LIT);
    },
  },

  // A hangar: a curved roof over big sliding doors, open a crack.
  hangar: {
    up: 14,
    paint(ctx, w, h, o) {
      const wall = '#b9c1c9';
      rect(ctx, 0, o - 14, w, h + 14, OUTLINE);
      for (let y = 0; y < 16; y++) {
        const inset = Math.max(0, 6 - Math.floor(Math.sqrt(y * 3)));
        rect(ctx, inset + 1, o - 13 + y, w - inset * 2 - 2, 1, y % 3 === 2 ? shade('#7d8791', -0.1) : '#7d8791');
      }
      rect(ctx, 1, o + 3, w - 2, h - 4, wall);
      for (let x = 4; x < w - 2; x += 6) rect(ctx, x, o + 3, 1, h - 4, shade(wall, -0.12));
      rect(ctx, w / 2 - 14, o + 10, 28, h - 11, OUTLINE);
      rect(ctx, w / 2 - 13, o + 11, 26, h - 12, shade(wall, -0.2));
      rect(ctx, w / 2 - 2, o + 11, 4, h - 12, '#2b2838');
      for (const x of [6, w - 14]) {
        rect(ctx, x, o + 6, 8, 5, OUTLINE);
        rect(ctx, x + 1, o + 7, 6, 3, '#8fb0cc');
      }
    },
    lit(ctx, w, _h, o) {
      for (const x of [6, w - 14]) rect(ctx, x + 1, o + 7, 6, 3, WINDOW_LIT);
    },
  },

  // A windsock on its pole, streaming out.
  windsock: {
    up: 26,
    paint(ctx, w, h, o) {
      rect(ctx, w / 2 - 1, o - 24, 2, h + 22, OUTLINE);
      dot(ctx, w / 2 - 1, o - 25, METAL.light);
      for (let i = 0; i < 4; i++) rect(ctx, w / 2 + 1 + i * 3, o - 23 + i, 3, 6 - i, i % 2 ? '#f4f4f4' : '#e7793a');
    },
  },
};
