// Home furniture art: beds, the kitchen, the TV corner, somewhere for the pet.
import { OUTLINE, hash, shade } from '../palette.ts';
import { TILE, dot, pill, rect } from '../pixels.ts';
import { METAL, WOOD, counterBase, mug, type Painter } from './common.ts';

const DUVETS = ['#5b8fd1', '#e4793a', '#7f4aa6', '#379463', '#d9607a'];

/** A bed seen from above: headboard, pillows, a duvet over the rest. Sleepers are drawn on the pillows. */
function bed(pillows: number): Painter {
  return {
    up: 6,
    // Sort above the pillow row so whoever's asleep is drawn on top.
    sortOffset: -2 * TILE + 12,
    paint(ctx, w, h, o, seed) {
      const duvet = DUVETS[Math.floor(seed * DUVETS.length)]!;
      rect(ctx, 0, o - 6, w, 9, WOOD.line);
      rect(ctx, 1, o - 5, w - 2, 7, WOOD.top);
      rect(ctx, 1, o - 5, w - 2, 1, WOOD.light);
      rect(ctx, 0, o + 2, w, h - 2, OUTLINE);
      rect(ctx, 1, o + 3, w - 2, h - 4, '#f4f1ea');
      const pw = (w - 2) / pillows;
      for (let i = 0; i < pillows; i++) pill(ctx, 2 + i * pw, o + 3, pw - 2, 7, '#ffffff', '#c9c3b6');
      // Duvet, folded back at the top.
      rect(ctx, 1, o + 11, w - 2, h - 12, duvet);
      rect(ctx, 1, o + 11, w - 2, 2, shade(duvet, 0.25));
      rect(ctx, 1, o + 13, w - 2, 1, shade(duvet, -0.2));
      for (let y = o + 17; y < o + h - 2; y += 5) rect(ctx, 2, y, w - 4, 1, shade(duvet, -0.08));
      rect(ctx, 1, o + h - 2, w - 2, 1, shade(duvet, -0.3));
      rect(ctx, 1, o + h - 1, 2, 1, WOOD.line);
      rect(ctx, w - 3, o + h - 1, 2, 1, WOOD.line);
    },
  };
}

export const HOME: Record<string, Painter> = {
  // A Christmas tree at home or at the office: tinsel and baubles, fairy lights after dark.
  homeTree: {
    up: 14,
    paint(ctx, w, h, o) {
      rect(ctx, w / 2 - 3, o + h - 6, 6, 5, OUTLINE);
      rect(ctx, w / 2 - 2, o + h - 5, 4, 4, '#c8453a');
      for (let row = 0; row < 22; row++) {
        const half = Math.min(7, 1 + Math.floor((row % 8) * 0.8 + row / 5));
        rect(ctx, w / 2 - half - 1, o - 14 + row, half * 2 + 2, 1, OUTLINE);
        rect(ctx, w / 2 - half, o - 14 + row, half * 2, 1, row % 4 === 3 ? '#2f6b3a' : '#3d8a45');
      }
      rect(ctx, w / 2 - 1, o - 16, 2, 3, '#f4c542');
      for (const [x, y, c] of [
        [-3, -8, '#c8453a'],
        [2, -4, '#3f74b5'],
        [-4, 0, '#e7aa2e'],
        [4, 2, '#c8453a'],
        [-1, 4, '#7f4aa6'],
      ] as const) {
        dot(ctx, w / 2 + x, o + y, c);
      }
    },
    lit(ctx, w, _h, o) {
      rect(ctx, w / 2 - 1, o - 16, 2, 3, '#fff3b0');
      const colours = ['#ffd98a', '#ff8c8c', '#8cc8ff', '#b6ff9c'];
      for (let i = 0; i < 10; i++) dot(ctx, w / 2 + (i % 2 ? 1 : -1) * (1 + (i % 5)), o - 11 + i * 2, colours[i % colours.length]!);
    },
  },

  bed: bed(2),
  singleBed: bed(1),

  stove: {
    up: 4,
    paint(ctx, w, h, o, seed) {
      counterBase(ctx, w, h, o);
      // Hob and oven door.
      rect(ctx, 1, o, w - 2, 5, '#2c3040');
      for (const x of [3, 9]) {
        pill(ctx, x, o + 1, 4, 3, '#4a4e5e');
        dot(ctx, x + 1, o + 2, '#2c3040');
      }
      rect(ctx, 2, o + 7, w - 4, 7, OUTLINE);
      rect(ctx, 3, o + 8, w - 6, 5, '#3b3542');
      rect(ctx, 4, o + 9, w - 8, 2, '#5a5263');
      if (seed > 0.5) {
        // A pan on the go.
        pill(ctx, 2, o - 3, 7, 5, METAL.dark, OUTLINE);
        rect(ctx, 9, o - 1, 4, 1, OUTLINE);
      }
    },
  },

  tv: {
    up: 14,
    paint(ctx, w, h, o) {
      // Low cabinet, then the screen.
      rect(ctx, 0, o + 2, w, h - 2, WOOD.line);
      rect(ctx, 1, o + 3, w - 2, h - 4, WOOD.dark);
      rect(ctx, 1, o + 3, w - 2, 1, WOOD.top);
      rect(ctx, w / 2, o + 4, 1, h - 6, WOOD.line);
      rect(ctx, 4, o - 14, w - 8, 15, OUTLINE);
      rect(ctx, 5, o - 13, w - 10, 12, '#1a1f2b');
      rect(ctx, 5, o - 13, w - 10, 1, '#2c3444');
      rect(ctx, w / 2 - 3, o + 1, 6, 1, OUTLINE);
    },
    screen: (w, _h, o) => [5, o - 13, w - 10, 12],
  },

  smallTable: {
    up: 3,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 3, o + h - 4, 2, 4, WOOD.line);
      rect(ctx, w - 5, o + h - 4, 2, 4, WOOD.line);
      pill(ctx, 0, o - 1, w, h - 2, WOOD.top, WOOD.line);
      rect(ctx, 2, o, w - 4, 1, WOOD.light);
      rect(ctx, 1, o + h - 5, w - 2, 1, WOOD.dark);
      mug(ctx, 5, o + 1);
      if (seed > 0.4) {
        pill(ctx, 16, o + 1, 8, 6, '#fbfaf5', METAL.dark);
        rect(ctx, 19, o + 3, 2, 2, '#e4793a');
      }
    },
  },

  homeDesk: {
    up: 8,
    down: TILE,
    paint(ctx, w, h, o, seed) {
      // A small desk: laptop, lamp, a stack of notebooks. Chair on the tile below.
      rect(ctx, 0, o, w, 11, WOOD.line);
      rect(ctx, 1, o + 1, w - 2, 8, WOOD.top);
      rect(ctx, 1, o + 1, w - 2, 1, WOOD.light);
      rect(ctx, 2, o + 11, 2, h - 11, WOOD.line);
      rect(ctx, w - 4, o + 11, 2, h - 11, WOOD.line);
      rect(ctx, 11, o - 5, 12, 8, OUTLINE);
      rect(ctx, 12, o - 4, 10, 6, '#18222f');
      rect(ctx, 13, o - 3, 5, 1, '#9be38a');
      rect(ctx, 13, o - 1, 7, 1, '#7fd1ff');
      rect(ctx, 10, o + 3, 14, 3, METAL.dark);
      rect(ctx, 11, o + 3, 12, 2, METAL.light);
      rect(ctx, 4, o - 6, 1, 9, METAL.line);
      pill(ctx, 2, o - 8, 6, 4, seed > 0.5 ? '#e7aa2e' : '#379463', OUTLINE);
      rect(ctx, 25, o + 2, 5, 2, '#c8453a');
      rect(ctx, 25, o + 4, 5, 2, '#3f74b5');
      // Chair
      const c = o + h;
      pill(ctx, 3, c + 2, 10, 9, '#6b4a3a', OUTLINE);
      rect(ctx, 4, c + 3, 8, 1, '#8a6050');
      rect(ctx, 5, c + 11, 1, 3, OUTLINE);
      rect(ctx, 10, c + 11, 1, 3, OUTLINE);
    },
    screen: (_w, _h, o) => [12, o - 4, 10, 6],
  },

  console: {
    up: 2,
    paint(ctx, w, _h, o) {
      // A console on a low stand, with a controller and a stack of games.
      rect(ctx, 1, o + 4, w - 2, 10, WOOD.line);
      rect(ctx, 2, o + 5, w - 4, 8, WOOD.dark);
      pill(ctx, 3, o - 1, 10, 6, '#2c3040', OUTLINE);
      rect(ctx, 4, o, 8, 1, '#4a4e66');
      dot(ctx, 11, o + 2, '#7de0a0');
      pill(ctx, 4, o + 7, 8, 4, '#e6eaee', OUTLINE);
      dot(ctx, 5, o + 8, '#2c3040');
      dot(ctx, 10, o + 8, '#e84855');
      rect(ctx, 13, o + 1, 2, 4, '#3f74b5');
    },
  },

  petBed: {
    up: 0,
    // Drawn under whoever's curled up in it.
    sortOffset: -TILE,
    paint(ctx, w, h, o) {
      pill(ctx, 1, o + 4, w - 2, h - 5, '#8a5a3b', OUTLINE);
      pill(ctx, 3, o + 6, w - 6, h - 9, '#f1dcc0');
      rect(ctx, 4, o + 7, w - 8, 1, '#fff2df');
    },
  },

  rug: {
    up: 0,
    flat: true,
    paint(ctx, w, h, o, seed) {
      const base = ['#b0442f', '#34406e', '#379463'][Math.floor(seed * 3)]!;
      rect(ctx, 2, o + 2, w - 4, h - 4, shade(base, -0.3));
      rect(ctx, 3, o + 3, w - 6, h - 6, base);
      rect(ctx, 6, o + 6, w - 12, h - 12, shade(base, 0.2));
      rect(ctx, 8, o + 8, w - 16, h - 16, base);
      for (let x = 3; x < w - 3; x += 2) {
        dot(ctx, x, o + 1, '#e8dcc0');
        dot(ctx, x, o + h - 2, '#e8dcc0');
      }
      for (let y = o + 9; y < o + h - 9; y += 3) {
        for (let x = 10; x < w - 10; x += 4) if (hash(x, y, seed) > 0.4) dot(ctx, x, y, shade(base, 0.35));
      }
    },
  },
};
