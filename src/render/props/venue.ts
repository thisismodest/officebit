// Venue art: the diner and the corner shop (outside and in), and sign lettering.
import { OUTLINE, hash, shade } from '../palette.ts';
import { TILE, dot, pill, rect, type Ctx } from '../pixels.ts';
import { METAL, WINDOW_LIT, counterBase, mug, type Painter } from './common.ts';

const CHROME = { light: '#eef2f5', mid: '#c3ccd4', dark: '#8a96a3' };
const TEAL = '#4fb3a9';
const CREAM = '#f4ecd8';
const CHERRY = '#d9434f';
const NEON = '#ff5d8f';

/** 3×5 pixel letters for signs. */
const GLYPHS: Record<string, string[]> = {
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  N: ['#.#', '###', '###', '#.#', '#.#'],
  E: ['###', '#..', '##.', '#..', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  L: ['#..', '#..', '#..', '#..', '###'],
};

const SHOP_GREEN = '#2f8a57';
const PRODUCTS = ['#c8453a', '#e7aa2e', '#3f74b5', '#f4ecd8', '#379463', '#e4793a', '#7f4aa6'];

/** Pixel lettering, 4px per character. */
export function sign(ctx: Ctx, text: string, x: number, y: number, color: string): void {
  for (const [i, ch] of [...text].entries()) {
    for (const [dy, row] of (GLYPHS[ch] ?? []).entries()) {
      for (const [dx, c] of [...row].entries()) if (c === '#') dot(ctx, x + i * 4 + dx, y + dy, color);
    }
  }
}

/** Where the diner's windows sit, relative to the facade top. */
const DINER_WINDOWS: [number, number][] = [[6, 0], [24, 0], [42, 0], [84, 0], [102, 0], [120, 0]];
const facadeTop = (o: number, h: number) => o + h - 40;

export const VENUE: Record<string, Painter> = {
  diner: {
    up: 14,
    paint(ctx, w, h, o) {
      const top = facadeTop(o, h);
      // Barrel roof in chrome, with the sign on top.
      rect(ctx, 0, o - 2, w, top - o + 3, OUTLINE);
      rect(ctx, 1, o - 1, w - 2, top - o + 1, CHROME.mid);
      for (let y = o; y < top; y += 4) rect(ctx, 1, y, w - 2, 1, CHROME.light);
      rect(ctx, w / 2 - 22, o - 14, 44, 12, OUTLINE);
      rect(ctx, w / 2 - 21, o - 13, 42, 10, '#2c2433');
      sign(ctx, 'DINER', w / 2 - 19, o - 11, shade(NEON, -0.3));
      // Cup of coffee on the end of the sign
      rect(ctx, w / 2 + 14, o - 10, 5, 5, CREAM);
      dot(ctx, w / 2 + 19, o - 8, CREAM);
      // Body: teal and cream, cherry stripe, a band of windows, chrome skirt.
      rect(ctx, 1, top, w - 2, o + h - top, OUTLINE);
      rect(ctx, 2, top, w - 4, o + h - top - 1, CREAM);
      rect(ctx, 2, top + 18, w - 4, 3, CHERRY);
      rect(ctx, 2, top + 21, w - 4, o + h - top - 25, TEAL);
      rect(ctx, 2, o + h - 4, w - 4, 3, CHROME.dark);
      for (const [x, y] of DINER_WINDOWS) window(ctx, x, top + 3 + y, false);
      // Door on the lot's door tile, under a little awning.
      const door = 4 * TILE;
      rect(ctx, door - 3, top + 1, TILE + 6, 3, CHERRY);
      rect(ctx, door, top + 4, TILE, o + h - top - 5, OUTLINE);
      rect(ctx, door + 1, top + 5, TILE - 2, o + h - top - 7, '#7fa6c9');
      rect(ctx, door + 3, top + 7, 3, 10, '#b5d0e6');
      dot(ctx, door + TILE - 3, top + 20, CHROME.light);
    },
    lit(ctx, w, h, o) {
      const top = facadeTop(o, h);
      for (const [x, y] of DINER_WINDOWS) window(ctx, x, top + 3 + y, true);
      sign(ctx, 'DINER', w / 2 - 19, o - 11, NEON);
    },
  },

  dinerCounter: {
    up: 6,
    down: TILE,
    paint(ctx, w, h, o, seed) {
      // Formica top, chrome edge, cream front with a cherry stripe.
      rect(ctx, 0, o - 2, w, h + 2, OUTLINE);
      rect(ctx, 1, o - 1, w - 2, 6, '#e9dfcf');
      rect(ctx, 1, o + 5, w - 2, 1, CHROME.mid);
      rect(ctx, 1, o + 6, w - 2, h - 7, CREAM);
      rect(ctx, 1, o + 10, w - 2, 2, CHERRY);
      // Things on the counter
      mug(ctx, 6, o - 5);
      rect(ctx, 20, o - 3, 3, 4, CHROME.mid);
      rect(ctx, 24, o - 4, 2, 5, '#d9a066');
      if (seed > 0.5) {
        // Pie under a glass dome
        pill(ctx, 40, o - 6, 12, 8, 'rgba(210,235,250,0.6)', OUTLINE);
        rect(ctx, 42, o - 2, 8, 3, '#c9803f');
        rect(ctx, 42, o - 2, 8, 1, '#8a3040');
      }
      // Stools along the front, on the tile below.
      for (let x = 0; x < w; x += TILE) {
        const c = o + h;
        rect(ctx, x + 7, c + 8, 2, 6, CHROME.dark);
        rect(ctx, x + 5, c + 13, 6, 1, CHROME.dark);
        pill(ctx, x + 3, c + 3, 10, 6, CHERRY, OUTLINE);
        rect(ctx, x + 4, c + 4, 8, 1, shade(CHERRY, 0.25));
      }
    },
  },

  booth: {
    up: 4,
    // Before anyone on either bench.
    sortOffset: -3 * TILE + 4,
    paint(ctx, w, _h, o) {
      // Two cherry vinyl benches with a formica table between.
      for (const y of [o - 4, o + 2 * TILE]) {
        pill(ctx, 0, y, w, TILE + 2, CHERRY, OUTLINE);
        rect(ctx, 2, y + 2, w - 4, 2, shade(CHERRY, 0.2));
        for (let x = 4; x < w - 2; x += 6) rect(ctx, x, y + 5, 1, TILE - 6, shade(CHERRY, -0.2));
      }
      rect(ctx, 1, o + TILE, w - 2, TILE, OUTLINE);
      rect(ctx, 2, o + TILE + 1, w - 4, TILE - 4, '#e9dfcf');
      rect(ctx, 2, o + 2 * TILE - 3, w - 4, 2, CHROME.mid);
      pill(ctx, 6, o + TILE + 3, 8, 5, '#ffffff', CHROME.dark);
      rect(ctx, 9, o + TILE + 4, 3, 2, '#e7aa2e');
      mug(ctx, 19, o + TILE + 2);
      rect(ctx, 14, o + TILE + 2, 3, 4, CHERRY);
    },
  },

  // Upturned rowing boats on a timber rack, with a pair of oars leant against it.
  boatRack: {
    up: 14,
    paint(ctx, w, h, o) {
      for (const x of [2, w - 4]) rect(ctx, x, o - 12, 2, h + 10, '#6b4a33');
      for (const [y, colour] of [[-10, '#9b6a43'], [-3, '#2f5d7a']] as const) {
        pill(ctx, 1, o + y, w - 2, 6, colour, OUTLINE);
        rect(ctx, 4, o + y + 2, w - 8, 1, shade(colour, 0.2));
      }
      rect(ctx, w - 9, o - 13, 1, h + 12, '#d9b886');
      rect(ctx, w - 7, o - 13, 1, h + 12, '#d9b886');
    },
  },

  jukebox: {
    up: 14,
    paint(ctx, w, h, o) {
      pill(ctx, 1, o - 14, w - 2, h + 13, '#b0442f', OUTLINE);
      rect(ctx, 3, o - 12, w - 6, 8, '#2c2433');
      rect(ctx, 3, o - 3, w - 6, 3, CHROME.mid);
      for (let x = 3; x < w - 3; x += 2) dot(ctx, x, o - 2, CHROME.dark);
      rect(ctx, 3, o + 2, w - 6, h - 5, shade('#b0442f', -0.2));
      rect(ctx, 4, o + 4, w - 8, 2, '#f3c969');
      rect(ctx, 4, o + 8, w - 8, 2, '#7fd1ff');
    },
    screen: (w, _h, o) => [3, o - 12, w - 6, 8],
  },

  supermarket: {
    up: 12,
    paint(ctx, w, h, o) {
      const top = o + h - 42;
      // Flat roof, then a green shopfront under a striped awning.
      rect(ctx, 0, o - 12, w, top - o + 13, OUTLINE);
      rect(ctx, 1, o - 11, w - 2, top - o + 11, '#8b93a3');
      rect(ctx, 3, o - 9, w - 6, top - o + 7, '#a3aab8');
      rect(ctx, 1, top, w - 2, o + h - top, OUTLINE);
      rect(ctx, 2, top, w - 4, o + h - top - 1, SHOP_GREEN);
      rect(ctx, w / 2 - 12, top + 2, 24, 9, OUTLINE);
      rect(ctx, w / 2 - 11, top + 3, 22, 7, '#f4ecd8');
      sign(ctx, 'SHOP', w / 2 - 8, top + 4, SHOP_GREEN);
      for (let x = 2; x < w - 2; x += 6) rect(ctx, x, top + 12, 6, 5, x % 12 === 2 ? SHOP_GREEN : '#f4ecd8');
      rect(ctx, 2, top + 17, w - 4, 1, 'rgba(0,0,0,0.3)');
      for (const x of SHOP_WINDOWS) shopWindow(ctx, x, top + 19, false);
      const door = 4 * TILE;
      rect(ctx, door, top + 18, TILE, o + h - top - 19, OUTLINE);
      rect(ctx, door + 1, top + 19, TILE - 2, o + h - top - 21, '#7fa6c9');
      rect(ctx, door + 3, top + 21, 3, 14, '#b5d0e6');
      // A stack of baskets by the door
      rect(ctx, door + TILE + 2, o + h - 8, 7, 6, '#c8453a');
      rect(ctx, door + TILE + 2, o + h - 6, 7, 1, shade('#c8453a', -0.3));
    },
    lit(ctx, _w, h, o) {
      for (const x of SHOP_WINDOWS) shopWindow(ctx, x, o + h - 42 + 19, true);
    },
  },

  shelf: {
    up: 12,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 0, o - 12, w, h + 11, OUTLINE);
      rect(ctx, 1, o - 11, w - 2, h + 9, METAL.mid);
      for (let s = 0; s < 3; s++) {
        const floor = o - 5 + s * 7;
        rect(ctx, 1, floor, w - 2, 1, METAL.dark);
        for (let x = 2; x < w - 2; x += 3) {
          const color = PRODUCTS[Math.floor(hash(x, s, seed * 50) * PRODUCTS.length)]!;
          const height = 3 + Math.floor(hash(s, x, seed * 9) * 3);
          rect(ctx, x, floor - height, 2, height, color);
          dot(ctx, x, floor - height, shade(color, 0.3));
        }
      }
    },
  },

  produce: {
    up: 4,
    paint(ctx, w, h, o, seed) {
      // Tilted wooden crates of fruit and veg.
      for (const [x, fruit] of [[1, '#c8453a'], [w / 2 + 1, seed > 0.5 ? '#e4793a' : '#6fbf5a']] as const) {
        rect(ctx, x, o - 3, w / 2 - 2, h, '#6b4a33');
        rect(ctx, x + 1, o - 2, w / 2 - 4, h - 4, '#a87a4c');
        for (let i = 0; i < 12; i++) {
          const fx = x + 2 + Math.floor(hash(i, x, seed) * (w / 2 - 7));
          const fy = o - 2 + Math.floor(hash(x, i, seed) * 7);
          rect(ctx, fx, fy, 2, 2, fruit);
          dot(ctx, fx, fy, shade(fruit, 0.35));
        }
      }
    },
  },

  chiller: {
    up: 14,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 0, o - 14, w, h + 13, OUTLINE);
      rect(ctx, 1, o - 13, w - 2, h + 11, '#d9e6ee');
      rect(ctx, 2, o - 12, w - 4, h + 6, '#a9d4ea');
      for (let s = 0; s < 3; s++) {
        for (let x = 3; x < w - 3; x += 3) {
          const color = ['#f4f4f4', '#e7aa2e', '#3f74b5', '#c8453a'][Math.floor(hash(x, s, seed * 7) * 4)]!;
          rect(ctx, x, o - 10 + s * 6, 2, 4, color);
        }
      }
      rect(ctx, 2, o - 12, 2, h + 6, 'rgba(255,255,255,0.35)');
      rect(ctx, w / 2, o - 12, 1, h + 6, OUTLINE);
    },
  },

  till: {
    up: 6,
    paint(ctx, w, h, o) {
      counterBase(ctx, w, h, o);
      rect(ctx, 2, o - 6, 12, 8, OUTLINE);
      rect(ctx, 3, o - 5, 10, 6, METAL.mid);
      rect(ctx, 4, o - 4, 6, 2, '#1f3b2d');
      rect(ctx, 5, o - 3, 4, 1, '#7de0a0');
      for (let x = 4; x < 12; x += 2) dot(ctx, x, o, METAL.dark);
    },
  },
  // The diner's grill, two tiles of counter: a hot plate with a couple of patties, and a pan.
  grill: {
    up: 4,
    paint(ctx, w, h, o) {
      counterBase(ctx, w, h, o);
      rect(ctx, 2, o - 3, 18, 5, OUTLINE);
      rect(ctx, 3, o - 2, 16, 3, '#3d3a38');
      for (let x = 4; x < 18; x += 3) dot(ctx, x, o - 1, '#e4793a');
      pill(ctx, 5, o - 2, 4, 2, '#8a5a3b');
      pill(ctx, 10, o - 2, 4, 2, '#8a5a3b');
      rect(ctx, 22, o - 3, 7, 4, OUTLINE);
      rect(ctx, 23, o - 2, 5, 2, METAL.mid);
      rect(ctx, 28, o - 2, 3, 1, OUTLINE);
    },
  },
};

function window(ctx: Ctx, x: number, y: number, lit: boolean): void {
  rect(ctx, x, y, 16, 13, OUTLINE);
  rect(ctx, x + 1, y + 1, 14, 11, lit ? WINDOW_LIT : '#6d8fb0');
  if (!lit) rect(ctx, x + 2, y + 2, 3, 8, '#a9c5de');
}

/** Where the shop's windows sit along its front. */
const SHOP_WINDOWS = [6, 30, 88, 112];

function shopWindow(ctx: Ctx, x: number, y: number, lit: boolean): void {
  rect(ctx, x, y, 22, 16, OUTLINE);
  rect(ctx, x + 1, y + 1, 20, 14, lit ? WINDOW_LIT : '#7fa6c9');
  // Goods on display behind the glass
  for (let i = 0; i < 5; i++) rect(ctx, x + 3 + i * 4, y + 10, 3, 4, PRODUCTS[i % PRODUCTS.length]!);
  if (!lit) rect(ctx, x + 2, y + 2, 3, 7, '#b5d0e6');
}
