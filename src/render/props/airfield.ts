// Airfield art (docs/TRAFFIC.md#planes): the little plane, its stand, the gate passengers wait at, a hangar, a windsock.
import { OUTLINE, shade } from '../palette.ts';
import { dot, rect } from '../pixels.ts';
import { vehicleSprite } from '../vehicles.ts';
import { METAL, WINDOW_LIT, type Painter } from './common.ts';

/** Where the plane's drawn on its footprint (w×h, from `o`): centred on it (its wings reach past it). */
export function planeAt(sprite: HTMLCanvasElement, w: number, h: number, o: number): [x: number, y: number] {
  return [Math.round((w - sprite.width) / 2), Math.round(o + (h - sprite.height) / 2)];
}

export const AIRFIELD: Record<string, Painter> = {
  // Standing on its stand, nose to the east: the same look it flies in (render/vehicles.ts).
  plane: {
    up: 6,
    down: 6,
    paint(ctx, w, h, o) {
      const sprite = vehicleSprite('plane', 'right');
      ctx.drawImage(sprite, ...planeAt(sprite, w, h, o));
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
