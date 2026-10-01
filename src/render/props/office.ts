// Office furniture art: workstations for each kind of team, kitchens,
// meeting rooms, the production studio.
import { OUTLINE, hash, shade } from '../palette.ts';
import { TILE, dot, pill, rect, type Ctx } from '../pixels.ts';
import {
  DARK_WOOD,
  METAL,
  WOOD,
  chair,
  counterBase,
  deskBase,
  keyboard,
  leaves,
  monitor,
  mug,
  paper,
  tableTop,
  type Painter,
  type Rect,
} from './common.ts';

interface StationOptions {
  wood?: typeof WOOD;
  chairColor?: string;
  /** x of the chair (the desk's spot). */
  chairX?: number;
  screen?: (o: number) => Rect;
}

/** A desk with a chair on the tile below; `decorate` adds what's on top. */
function workstation(decorate: (ctx: Ctx, w: number, o: number, seed: number) => void, options: StationOptions = {}): Painter {
  return {
    up: 10,
    down: TILE,
    paint(ctx, w, h, o, seed) {
      deskBase(ctx, w, h, o, options.wood);
      decorate(ctx, w, o, seed);
      chair(ctx, options.chairX ?? 0, o + h, options.chairColor);
    },
    screen: options.screen ? (_w, _h, o) => options.screen!(o) : undefined,
  };
}

const monitorScreen = (x: number, w: number) => (o: number): Rect => [x + 2, o - 7, w - 4, 7];

const TIMELINE = ['#e98fb3', '#7fd1ff', '#9be38a', '#f3c969'];
const DESIGN = ['#f3c969', '#e98fb3', '#7fd1ff', '#e4793a', '#ffffff'];

export const OFFICE: Record<string, Painter> = {
  computerDesk: workstation(
    (ctx, _w, o, seed) => {
      monitor(ctx, 8, o - 9, 16, seed);
      keyboard(ctx, 9, o + 5);
      pill(ctx, 24, o + 5, 3, 4, METAL.light, METAL.dark);
      const clutter = Math.floor(seed * 4);
      if (clutter === 0) mug(ctx, 2, o + 2);
      else if (clutter === 1) paper(ctx, 2, o + 2);
      else if (clutter === 2) {
        rect(ctx, 2, o + 5, 5, 4, '#b8683f');
        rect(ctx, 3, o, 3, 5, '#4f9a55');
        dot(ctx, 4, o + 1, '#7cc47f');
      } else {
        rect(ctx, 2, o + 3, 4, 4, '#f7e58f');
        rect(ctx, 4, o + 5, 4, 4, '#f5a3c0');
      }
    },
    { screen: monitorScreen(8, 16) },
  ),

  editingDesk: workstation(
    (ctx, _w, o, seed) => {
      // Two screens full of timeline, and headphones for the edit.
      monitor(ctx, 1, o - 9, 15, seed, TIMELINE);
      monitor(ctx, 16, o - 9, 15, seed + 1, TIMELINE);
      keyboard(ctx, 9, o + 5);
      rect(ctx, 25, o + 3, 5, 1, OUTLINE);
      rect(ctx, 24, o + 4, 2, 3, '#c8453a');
      rect(ctx, 29, o + 4, 2, 3, '#c8453a');
    },
    { screen: monitorScreen(1, 30) },
  ),

  supportDesk: workstation(
    (ctx, _w, o, seed) => {
      monitor(ctx, 3, o - 9, 15, seed);
      keyboard(ctx, 4, o + 5);
      // Headset on its stand, and a desk phone.
      rect(ctx, 23, o - 3, 1, 8, METAL.line);
      rect(ctx, 21, o - 5, 6, 1, OUTLINE);
      rect(ctx, 20, o - 4, 2, 3, '#1f9e95');
      rect(ctx, 26, o - 4, 2, 3, '#1f9e95');
      rect(ctx, 21, o + 5, 2, 1, METAL.line);
      pill(ctx, 22, o + 4, 7, 5, '#2c3040', OUTLINE);
      for (const [x, y] of [[24, 6], [26, 6], [24, 7], [26, 7]] as const) dot(ctx, x, o + y, METAL.mid);
    },
    { screen: monitorScreen(3, 15) },
  ),

  drawingDesk: workstation(
    (ctx, _w, o, seed) => {
      monitor(ctx, 6, o - 9, 20, seed, DESIGN);
      // Drawing tablet and stylus, and a strip of swatches.
      rect(ctx, 8, o + 3, 14, 6, OUTLINE);
      rect(ctx, 9, o + 4, 12, 4, '#3a3f4f');
      rect(ctx, 10, o + 5, 9, 2, '#4a5066');
      rect(ctx, 22, o + 4, 1, 4, METAL.mid);
      for (const [i, color] of DESIGN.slice(0, 4).entries()) rect(ctx, 25, o + 1 + i * 2, 4, 2, color);
    },
    { screen: monitorScreen(6, 20) },
  ),

  laptopDesk: workstation(
    (ctx, _w, o) => {
      // Open laptop, notebook and pen, and a couple of fragrance samples.
      rect(ctx, 10, o - 4, 12, 8, OUTLINE);
      rect(ctx, 11, o - 3, 10, 6, '#18222f');
      rect(ctx, 12, o - 2, 6, 1, '#b7a4f5');
      rect(ctx, 12, o, 4, 1, '#f3c969');
      rect(ctx, 9, o + 4, 14, 3, METAL.dark);
      rect(ctx, 10, o + 4, 12, 2, METAL.light);
      rect(ctx, 2, o + 2, 6, 7, '#34406e');
      rect(ctx, 3, o + 3, 4, 5, '#f4efe2');
      rect(ctx, 7, o + 3, 1, 5, '#c8453a');
      for (const [x, color] of [[25, '#d9a066'], [28, '#b7a4f5']] as const) {
        rect(ctx, x, o + 1, 3, 5, OUTLINE);
        rect(ctx, x, o + 2, 3, 4, color);
        dot(ctx, x + 1, o + 3, '#ffffff');
        rect(ctx, x, o, 3, 1, '#2c3040');
      }
    },
    { screen: (o) => [11, o - 3, 10, 6] },
  ),

  opsDesk: workstation(
    (ctx, _w, o, seed) => {
      monitor(ctx, 3, o - 9, 15, seed);
      keyboard(ctx, 3, o + 5);
      // Clipboard, and a parcel waiting to go out.
      rect(ctx, 19, o + 1, 5, 7, '#8a5a35');
      rect(ctx, 20, o + 2, 3, 5, '#fbfaf5');
      rect(ctx, 20, o + 1, 3, 1, METAL.dark);
      rect(ctx, 24, o - 6, 7, 9, '#8a5a35');
      rect(ctx, 25, o - 5, 5, 7, '#c49a6c');
      rect(ctx, 27, o - 5, 1, 7, '#e8d9a8');
    },
    { screen: monitorScreen(3, 15) },
  ),

  executiveDesk: workstation(
    (ctx, w, o, seed) => {
      monitor(ctx, 17, o - 9, 16, seed);
      keyboard(ctx, 18, o + 5);
      // Brass lamp, a trophy, a fountain pen.
      rect(ctx, 5, o - 3, 1, 8, '#b08d3c');
      pill(ctx, 2, o - 8, 8, 5, '#2f6b4a', OUTLINE);
      rect(ctx, 3, o + 5, 6, 1, '#b08d3c');
      rect(ctx, w - 8, o - 2, 4, 3, '#e7c14a');
      rect(ctx, w - 7, o + 1, 2, 3, '#b08d3c');
      rect(ctx, w - 9, o + 4, 6, 2, DARK_WOOD.line);
      rect(ctx, 36, o + 6, 5, 1, OUTLINE);
    },
    { wood: DARK_WOOD, chairColor: '#6b3a2a', chairX: TILE, screen: monitorScreen(17, 16) },
  ),

  arcade: {
    up: 16,
    paint(ctx, w, h, o, seed) {
      const body = ['#7f4aa6', '#c8453a', '#1f9e95'][Math.floor(seed * 3)]!;
      // Cabinet, marquee, screen, controls.
      rect(ctx, 1, o - 16, w - 2, h + 15, OUTLINE);
      rect(ctx, 2, o - 15, w - 4, h + 13, body);
      rect(ctx, 2, o - 15, 2, h + 13, shade(body, 0.2));
      rect(ctx, 3, o - 14, w - 6, 3, '#f3c969');
      rect(ctx, 4, o - 13, w - 8, 1, '#e84855');
      rect(ctx, 3, o - 10, w - 6, 8, OUTLINE);
      rect(ctx, 4, o - 9, w - 8, 6, '#101828');
      rect(ctx, 5, o - 8, 2, 1, '#9be38a');
      rect(ctx, 9, o - 6, 2, 1, '#e98fb3');
      rect(ctx, 3, o - 1, w - 6, 3, shade(body, -0.3));
      dot(ctx, 5, o, OUTLINE);
      rect(ctx, 5, o - 1, 1, 1, '#e84855');
      dot(ctx, 9, o, '#f3c969');
      dot(ctx, 11, o, '#7fd1ff');
      rect(ctx, 4, o + 4, w - 8, h - 6, shade(body, -0.15));
    },
    screen: (w, _h, o) => [4, o - 9, w - 8, 6],
  },

  checkout: workstation(
    (ctx, w, o) => {
      // A conveyor belt, a till with its screen, a card reader.
      rect(ctx, 1, o + 2, w - 12, 5, OUTLINE);
      rect(ctx, 2, o + 3, w - 14, 3, '#2c3040');
      for (let x = 3; x < w - 13; x += 3) dot(ctx, x, o + 4, '#4a4e5e');
      rect(ctx, w - 10, o - 6, 8, 8, OUTLINE);
      rect(ctx, w - 9, o - 5, 6, 4, '#1f3b2d');
      rect(ctx, w - 8, o - 4, 4, 1, '#7de0a0');
      rect(ctx, w - 10, o + 3, 4, 5, '#44546a');
      dot(ctx, w - 9, o + 4, '#7fd1ff');
    },
    { chairColor: '#2f8a57', screen: (o) => [22, o - 5, 6, 4] },
  ),

  coffee: {
    up: 13,
    paint(ctx, w, h, o) {
      counterBase(ctx, w, h, o);
      rect(ctx, 2, o - 11, 12, 15, OUTLINE);
      rect(ctx, 3, o - 10, 10, 13, '#3b3542');
      rect(ctx, 3, o - 10, 10, 1, '#5a5263');
      rect(ctx, 3, o - 13, 10, 3, OUTLINE);
      rect(ctx, 4, o - 12, 8, 1, '#6b4a33');
      rect(ctx, 4, o - 8, 5, 3, '#1f3b2d');
      rect(ctx, 5, o - 7, 3, 1, '#7de0a0');
      dot(ctx, 11, o - 8, '#e84855');
      dot(ctx, 11, o - 6, '#f3c969');
      rect(ctx, 4, o - 3, 8, 6, '#1f1a24');
      rect(ctx, 7, o - 3, 2, 1, METAL.dark);
      mug(ctx, 5, o - 1);
    },
  },

  fridge: {
    up: 14,
    paint(ctx, w, h, o) {
      rect(ctx, 1, o - 14, w - 2, h + 13, METAL.line);
      rect(ctx, 2, o - 13, w - 4, h + 11, METAL.light);
      rect(ctx, w - 4, o - 13, 2, h + 11, METAL.mid);
      rect(ctx, 2, o - 13, w - 6, 1, '#ffffff');
      rect(ctx, 2, o - 4, w - 4, 1, METAL.dark);
      rect(ctx, 11, o - 11, 1, 5, METAL.dark);
      rect(ctx, 11, o - 1, 1, 8, METAL.dark);
      rect(ctx, 4, o - 11, 4, 4, '#f7e58f');
      dot(ctx, 4, o + 1, '#e84855');
      dot(ctx, 7, o + 3, '#3f74b5');
      dot(ctx, 5, o + 6, '#379463');
      rect(ctx, 2, o + h - 2, w - 4, 1, METAL.dark);
    },
  },

  cooler: {
    up: 13,
    paint(ctx, _w, h, o) {
      rect(ctx, 3, o - 2, 10, h + 1, METAL.line);
      rect(ctx, 4, o - 1, 8, h - 1, METAL.light);
      rect(ctx, 11, o - 1, 1, h - 1, METAL.mid);
      rect(ctx, 5, o + 1, 6, 4, METAL.mid);
      dot(ctx, 6, o + 2, '#e84855');
      dot(ctx, 9, o + 2, '#3f74b5');
      rect(ctx, 5, o + 8, 6, 1, METAL.dark);
      rect(ctx, 4, o - 12, 8, 11, '#3d7fb0');
      rect(ctx, 5, o - 11, 6, 9, '#8fd0f5');
      rect(ctx, 5, o - 11, 1, 8, '#d8f1ff');
      rect(ctx, 5, o - 7, 6, 1, '#6bbbe8');
      rect(ctx, 6, o - 13, 4, 1, '#3d7fb0');
      dot(ctx, 9, o - 9, '#ffffff');
    },
  },

  counter: {
    up: 4,
    paint(ctx, w, h, o, seed) {
      counterBase(ctx, w, h, o);
      const item = Math.floor(seed * 3);
      if (item === 0) {
        // Kettle
        pill(ctx, 4, o - 4, 7, 7, METAL.light, METAL.line);
        rect(ctx, 11, o - 2, 1, 3, METAL.line);
      } else if (item === 1) {
        // Fruit bowl
        pill(ctx, 3, o - 1, 10, 4, '#e6d3b3', '#8a6a4a');
        dot(ctx, 5, o - 2, '#e84855');
        dot(ctx, 8, o - 2, '#f3c969');
        dot(ctx, 10, o - 1, '#6fbf5a');
      } else {
        // Toaster
        pill(ctx, 3, o - 3, 10, 6, '#c8453a', OUTLINE);
        rect(ctx, 5, o - 3, 2, 1, OUTLINE);
        rect(ctx, 9, o - 3, 2, 1, OUTLINE);
      }
    },
  },

  sink: {
    up: 6,
    paint(ctx, w, h, o) {
      counterBase(ctx, w, h, o);
      pill(ctx, 3, o, 10, 4, METAL.mid, METAL.line);
      rect(ctx, 4, o + 1, 8, 2, METAL.dark);
      rect(ctx, 7, o - 5, 2, 5, METAL.line);
      rect(ctx, 7, o - 5, 4, 1, METAL.line);
    },
  },

  table: {
    up: 4,
    paint(ctx, w, h, o, seed) {
      tableTop(ctx, w, h, o, '#c9a06b', '#b48a58', '#7a5436');
      for (let i = 0; i < 3; i++) {
        for (const [y, flip] of [[o + 3, false], [o + h - 12, true]] as const) {
          if (hash(i, y, seed * 7) < 0.3) continue;
          const x = 4 + i * 15;
          pill(ctx, x, y, 8, 6, '#fbfaf5', METAL.dark);
          rect(ctx, x + 3, y + 2, 2, 2, ['#e4793a', '#9be38a', '#c8453a', '#f3c969'][Math.floor(hash(i, y, seed) * 4)]!);
          mug(ctx, x + (flip ? -4 : 9), y);
        }
      }
      pill(ctx, w / 2 - 5, o + h / 2 - 4, 10, 6, '#e6d3b3', '#8a6a4a');
      dot(ctx, w / 2 - 2, o + h / 2 - 3, '#e84855');
      dot(ctx, w / 2, o + h / 2 - 3, '#f3c969');
      dot(ctx, w / 2 + 2, o + h / 2 - 2, '#6fbf5a');
    },
  },

  meetingTable: {
    up: 4,
    paint(ctx, w, h, o, seed) {
      tableTop(ctx, w, h, o, '#7a5a44', '#6a4c39', '#3f2a1e');
      rect(ctx, 3, o + 3, w - 6, 1, '#94725a');
      const spots: [number, number][] = [[5, o + 3], [20, o + 3], [35, o + 3], [5, o + h - 12], [35, o + h - 12]];
      spots.forEach(([x, y], i) => {
        const r = hash(i, 0, seed * 11);
        if (r < 0.45) {
          rect(ctx, x, y, 9, 6, OUTLINE);
          rect(ctx, x + 1, y + 1, 7, 4, '#9aa3ad');
          rect(ctx, x + 1, y + 1, 7, 3, '#2b3a4f');
          rect(ctx, x + 2, y + 2, 3, 1, '#7fd1ff');
        } else if (r < 0.8) {
          paper(ctx, x, y, 7, 6);
        }
      });
      pill(ctx, w / 2 - 4, o + h / 2 - 4, 8, 6, '#2c3040', OUTLINE);
      dot(ctx, w / 2 - 1, o + h / 2 - 2, '#7de0a0');
    },
  },

  sofa: seating('#8e4f7a'),
  armchair: seating('#3f74b5'),

  whiteboard: {
    up: 14,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 4, o + 4, 2, h - 5, METAL.dark);
      rect(ctx, w - 6, o + 4, 2, h - 5, METAL.dark);
      rect(ctx, 2, o + h - 2, 6, 2, METAL.line);
      rect(ctx, w - 8, o + h - 2, 6, 2, METAL.line);
      rect(ctx, 1, o - 14, w - 2, 19, METAL.line);
      rect(ctx, 2, o - 13, w - 4, 17, METAL.mid);
      rect(ctx, 3, o - 12, w - 6, 15, '#f8fafc');
      for (let line = 0; line < 4; line++) {
        let x = 5;
        const end = 5 + 10 + Math.floor(hash(line, 0, seed * 3) * 8);
        while (x < end) {
          const len = 1 + Math.floor(hash(x, line, seed * 5) * 4);
          rect(ctx, x, o - 10 + line * 3, Math.min(len, end - x), 1, '#3f74b5');
          x += len + 1;
        }
      }
      const chart = [6, 4, 5, 2, 3, 1];
      chart.forEach((v, i) => {
        dot(ctx, 31 + i * 2, o - 11 + v * 2, '#c8453a');
        if (i > 0) dot(ctx, 30 + i * 2, o - 11 + Math.round(((chart[i - 1]! + v) / 2) * 2), '#c8453a');
      });
      rect(ctx, 30, o - 1, 13, 1, METAL.dark);
      rect(ctx, 30, o - 12, 1, 11, METAL.dark);
      rect(ctx, 3, o + 3, w - 6, 2, METAL.dark);
      rect(ctx, 8, o + 2, 4, 1, '#c8453a');
      rect(ctx, 14, o + 2, 4, 1, '#3f74b5');
      rect(ctx, 20, o + 2, 4, 1, OUTLINE);
    },
  },

  backdrop: {
    up: 24,
    paint(ctx, w, h, o) {
      // Poles, the paper roll, and the sheet sweeping onto the floor.
      rect(ctx, 1, o - 24, 2, h + 24, METAL.line);
      rect(ctx, w - 3, o - 24, 2, h + 24, METAL.line);
      pill(ctx, 1, o - 24, w - 2, 4, '#d8d2c6', OUTLINE);
      rect(ctx, 4, o - 20, w - 8, h + 18, '#e9e4da');
      for (let y = o - 20; y < o + h - 2; y += 1) {
        const t = (y - (o - 20)) / (h + 18);
        rect(ctx, 4, y, w - 8, 1, shade('#e9e4da', -0.12 * t));
      }
      rect(ctx, 4, o + h - 2, w - 8, 1, shade('#e9e4da', -0.2));
    },
  },

  studioLight: {
    up: 20,
    paint(ctx, _w, h, o) {
      // Tripod, pole and a softbox.
      rect(ctx, 7, o - 8, 2, h + 4, METAL.line);
      rect(ctx, 3, o + h - 3, 10, 1, METAL.line);
      dot(ctx, 2, o + h - 2, METAL.line);
      dot(ctx, 13, o + h - 2, METAL.line);
      rect(ctx, 1, o - 20, 14, 12, OUTLINE);
      rect(ctx, 2, o - 19, 12, 10, '#fff7df');
      rect(ctx, 3, o - 18, 10, 1, '#ffffff');
      rect(ctx, 2, o - 10, 12, 1, '#e8dcb8');
    },
  },

  cameraRig: {
    up: 12,
    paint(ctx, _w, h, o) {
      rect(ctx, 7, o - 4, 2, h, METAL.line);
      rect(ctx, 3, o + h - 2, 1, 2, METAL.line);
      rect(ctx, 12, o + h - 2, 1, 2, METAL.line);
      rect(ctx, 4, o + h - 4, 8, 1, METAL.line);
      rect(ctx, 2, o - 11, 11, 8, OUTLINE);
      rect(ctx, 3, o - 10, 9, 6, '#2c3040');
      rect(ctx, 11, o - 9, 4, 4, OUTLINE);
      rect(ctx, 12, o - 8, 2, 2, '#4a6a8a');
      dot(ctx, 4, o - 9, '#e84855');
      rect(ctx, 5, o - 12, 4, 1, OUTLINE);
    },
  },

  stairs: {
    up: 0,
    flat: true,
    paint(ctx, w, h, o) {
      // Steps climbing north, darker as they recede, with rails either side.
      const steps = 8;
      for (let i = 0; i < steps; i++) {
        const y = o + (i * h) / steps;
        const tread = shade('#b9a78f', -0.3 + (i / steps) * 0.3);
        rect(ctx, 2, y, w - 4, h / steps, tread);
        rect(ctx, 2, y, w - 4, 1, shade(tread, 0.2));
      }
      rect(ctx, 0, o, 2, h, '#5a3822');
      rect(ctx, w - 2, o, 2, h, '#5a3822');
      rect(ctx, 0, o, 2, 1, WOOD.light);
      rect(ctx, w - 2, o, 2, 1, WOOD.light);
    },
  },

  plant: {
    up: 14,
    paint(ctx, w, h, o, seed) {
      rect(ctx, 3, o + 5, 10, 3, '#6e3a22');
      rect(ctx, 4, o + 6, 8, 1, '#cf8154');
      rect(ctx, 4, o + 8, 8, h - 9, '#6e3a22');
      rect(ctx, 5, o + 8, 6, h - 10, '#b8683f');
      rect(ctx, 5, o + 8, 1, h - 10, '#cf8154');
      rect(ctx, 5, o + 5, 6, 1, '#4a3325');
      leaves(ctx, w / 2, o + 5, seed, 6 + Math.floor(seed * 3), 16);
    },
  },

  pizza: {
    up: 8,
    paint(ctx, w, h, o) {
      // A stack of boxes, the top one open.
      for (let i = 0; i < 2; i++) {
        rect(ctx, 1, o + h - 5 - i * 4, w - 2, 4, OUTLINE);
        rect(ctx, 2, o + h - 4 - i * 4, w - 4, 2, '#d9b886');
      }
      pill(ctx, 1, o - 6, w - 2, 12, '#d9b886', OUTLINE);
      pill(ctx, 3, o - 4, w - 6, 8, '#e7aa2e');
      for (const [x, y] of [[5, -2], [9, 0], [7, 2], [11, -3]] as const) dot(ctx, x, o + y, '#c8453a');
      rect(ctx, 3, o - 7, w - 6, 2, shade('#d9b886', -0.2));
    },
  },

  birthdayCake: {
    up: 10,
    paint(ctx, w, _h, o) {
      // A plate, two tiers of sponge with icing, and candles lit.
      pill(ctx, 1, o + 6, w - 2, 4, '#f1eee6', OUTLINE);
      rect(ctx, 3, o - 1, w - 6, 9, OUTLINE);
      rect(ctx, 4, o, w - 8, 7, '#f3d7e2');
      rect(ctx, 4, o + 3, w - 8, 1, '#d9708f');
      rect(ctx, 4, o, w - 8, 1, '#ffffff');
      for (const x of [5, 8, 11]) {
        rect(ctx, x, o - 5, 1, 4, '#7fb6e6');
        dot(ctx, x, o - 7, '#ffd04a');
      }
    },
  },

  bookshelf: {
    up: 18,
    paint(ctx, w, h, o, seed) {
      const top = o - 18;
      rect(ctx, 0, top, w, h + 18, '#3b271a');
      rect(ctx, 1, top + 1, w - 2, h + 16, '#6b4a33');
      rect(ctx, 2, top + 2, w - 4, h + 14, '#3f2b1f');
      const books = ['#c8453a', '#3f74b5', '#e7aa2e', '#379463', '#7f4aa6', '#e4793a', '#eee4cf', '#1f9e95'];
      for (let s = 0; s < 4; s++) {
        const floor = top + 2 + s * 8 + 7;
        rect(ctx, 1, floor, w - 2, 2, '#8a5e3f');
        let x = 2;
        while (x < w - 3) {
          const r = hash(x, s, seed * 131);
          if (r < 0.1) {
            x += 2;
            continue;
          }
          const bw = r > 0.7 ? 3 : 2;
          const bh = 4 + Math.floor(hash(x, s, seed * 7) * 3);
          const color = books[Math.floor(hash(s, x, seed * 17) * books.length)]!;
          rect(ctx, x, floor - bh, bw, bh, color);
          rect(ctx, x, floor - bh, bw, 1, shade(color, 0.25));
          if (bw === 3) dot(ctx, x + 1, floor - bh + 2, shade(color, -0.3));
          x += bw;
        }
      }
    },
  },
};

/** Sofas and armchairs: a back, arms, one cushion per tile. */
function seating(base: string): Painter {
  return {
    up: 8,
    sortOffset: -8,
    paint(ctx, w, h, o, seed) {
      const light = shade(base, 0.18);
      const dark = shade(base, -0.25);
      const line = shade(base, -0.55);
      pill(ctx, 0, o - 8, w, 12, base, line);
      rect(ctx, 2, o - 7, w - 4, 1, light);
      for (let x = 4; x < w - 4; x += TILE) {
        const cw = Math.min(TILE, w - 4 - x);
        pill(ctx, x, o + 2, cw, 9, light, line);
        rect(ctx, x + 1, o + 3, cw - 2, 1, shade(light, 0.15));
      }
      pill(ctx, 0, o - 3, 5, 16, base, line);
      pill(ctx, w - 5, o - 3, 5, 16, base, line);
      rect(ctx, 1, o - 2, 3, 1, light);
      rect(ctx, w - 4, o - 2, 3, 1, light);
      rect(ctx, 4, o + 11, w - 8, 3, dark);
      rect(ctx, 4, o + 14, w - 8, 1, line);
      dot(ctx, 2, o + h - 1, line);
      dot(ctx, w - 3, o + h - 1, line);
      if (w > TILE) {
        const cx = seed > 0.5 ? 5 : w - 12;
        pill(ctx, cx, o - 3, 7, 6, '#f3c969', '#a3822f');
        dot(ctx, cx + 3, o - 1, '#d9a93f');
      }
    },
  };
}
