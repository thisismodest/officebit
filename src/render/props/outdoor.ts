// Town art: the office from outside, houses, trees, street furniture.
import { OUTLINE, hash, shade } from '../palette.ts';
import { TILE, dot, pill, rect, type Ctx } from '../pixels.ts';
import { METAL, WINDOW_LIT, WOOD, canopy, type Painter } from './common.ts';

/** How many looks a building site goes through as work progresses. */
const SITE_STAGES = 4;
const ROOFS = ['#9c3f33', '#3f5a7a', '#4f6b3a', '#6b4a3a', '#5a4f6e'];
const WALLS = ['#e8dcc4', '#d9b99a', '#c9d3d6', '#e6c9b8', '#d7d0b0'];

function window(ctx: Ctx, x: number, y: number, w: number, h: number, lit: boolean): void {
  rect(ctx, x, y, w, h, OUTLINE);
  rect(ctx, x + 1, y + 1, w - 2, h - 2, lit ? WINDOW_LIT : '#5d7a99');
  if (!lit) rect(ctx, x + 1, y + 1, w - 2, 1, '#8fb0cc');
  rect(ctx, x + Math.floor(w / 2), y + 1, 1, h - 2, OUTLINE);
  rect(ctx, x, y + h, w, 1, shade('#d8d0c0', -0.2));
}

/** Where the front door is: the second tile along, in both facings (places.ts looks for the portal there). */
const HOUSE_DOOR_X = TILE;

/**
 * A house of any width. Facing down, you see its front: door, windows,
 * pitched roof. Facing up, the door is round the far side, so you see the
 * back wall and roof, with a porch peeping over the ridge.
 */
function house(): Painter {
  const windowsOf = (w: number, back: boolean): [number, number][] => {
    // Front: one window left of the door, the rest beyond it. Back: evenly along the wall.
    const from = back ? 6 : HOUSE_DOOR_X + TILE + 2;
    const slots: [number, number][] = back ? [] : [[3, 10]];
    for (let x = from; x + 12 <= w - 3; x += 16) slots.push([x, 12]);
    return slots;
  };
  return {
    up: 20,
    paint(ctx, w, h, o, seed, def) {
      const back = def.faces === 'up';
      const roof = ROOFS[Math.floor(seed * ROOFS.length)]!;
      const wall = WALLS[Math.floor(hash(seed * 100, 1) * WALLS.length)]!;
      const eaves = o + h - 30;
      // Facing up, the roof sits lower so the path to the door (the row above) stays in view.
      const ridge = back ? o + 2 : o - 20;
      rect(ctx, 1, eaves, w - 2, o + h - eaves, OUTLINE);
      rect(ctx, 2, eaves, w - 4, o + h - eaves - 1, wall);
      rect(ctx, 2, o + h - 3, w - 4, 2, shade(wall, -0.2));
      // Pitched roof: narrow at the ridge, full width at the eaves.
      for (let y = ridge; y < eaves; y++) {
        const inset = Math.max(0, 8 - (y - ridge));
        const band = (y - ridge) % 4 === 3 ? -0.15 : 0;
        rect(ctx, inset, y, w - inset * 2, 1, shade(roof, band));
        dot(ctx, inset, y, OUTLINE);
        dot(ctx, w - inset - 1, y, OUTLINE);
      }
      rect(ctx, 8, ridge, w - 16, 1, OUTLINE);
      rect(ctx, 0, eaves, w, 1, OUTLINE);
      rect(ctx, 1, eaves + 1, w - 2, 1, shade(wall, -0.3));
      // Chimney
      const chimney = back ? 10 : w - 18;
      rect(ctx, chimney, ridge + 2, 7, 12, OUTLINE);
      rect(ctx, chimney + 1, ridge + 3, 5, 11, '#8a4a3a');
      rect(ctx, chimney + 1, ridge + 3, 5, 1, '#a86050');
      if (back) {
        // The porch over the front door, just showing above the ridge.
        rect(ctx, HOUSE_DOOR_X + 1, ridge - 3, 14, 6, OUTLINE);
        rect(ctx, HOUSE_DOOR_X + 2, ridge - 2, 12, 4, shade(roof, -0.2));
        rect(ctx, HOUSE_DOOR_X + 3, ridge - 2, 10, 1, shade(roof, 0.15));
      } else {
        // Front door (on the tile the path meets).
        rect(ctx, HOUSE_DOOR_X + 3, o + h - 21, 10, 20, OUTLINE);
        rect(ctx, HOUSE_DOOR_X + 4, o + h - 20, 8, 19, shade(roof, -0.1));
        dot(ctx, HOUSE_DOOR_X + 10, o + h - 11, '#e7c14a');
        rect(ctx, HOUSE_DOOR_X + 2, o + h - 1, 12, 1, shade(wall, -0.35));
      }
      for (const [x, width] of windowsOf(w, back)) window(ctx, x, eaves + 5, width, 10, false);
    },
    lit(ctx, w, h, o, _seed, def) {
      for (const [x, width] of windowsOf(w, def.faces === 'up')) window(ctx, x, o + h - 30 + 5, width, 10, true);
    },
  };
}

const OFFICE_W = 12 * TILE;
const OFFICE_DOOR_X = 5 * TILE;
/** Facade layout for the office: [x, y] of each window, relative to the facade top. */
const OFFICE_WINDOWS: [number, number][] = [];
for (const y of [4, 20]) {
  for (let x = 8; x < OFFICE_W - 18; x += 20) {
    const clearOfDoor = x + 14 < OFFICE_DOOR_X - 4 || x > OFFICE_DOOR_X + 2 * TILE + 4;
    if (y === 4 || clearOfDoor) OFFICE_WINDOWS.push([x, y]);
  }
}
/** Where the office facade starts, below the roof. */
const officeFacade = (o: number, h: number) => o + h - 44;

export const OUTDOOR: Record<string, Painter> = {
  officeBuilding: {
    up: 8,
    paint(ctx, w, h, o) {
      const top = officeFacade(o, h);
      // Flat roof: parapet, membrane, vents and a skylight.
      rect(ctx, 0, o - 8, w, top - o + 9, OUTLINE);
      rect(ctx, 1, o - 7, w - 2, top - o + 7, '#5f586e');
      rect(ctx, 4, o - 4, w - 8, top - o + 1, '#726c84');
      for (let x = 20; x < w - 4; x += 24) rect(ctx, x, o - 4, 1, top - o + 1, '#6a647b');
      rect(ctx, 16, o + 6, 18, 12, METAL.line);
      rect(ctx, 17, o + 7, 16, 10, METAL.mid);
      for (let x = 19; x < 32; x += 3) rect(ctx, x, o + 8, 1, 8, METAL.dark);
      rect(ctx, w - 64, o + 10, 44, 22, OUTLINE);
      rect(ctx, w - 63, o + 11, 42, 20, '#7fa6c9');
      rect(ctx, w - 63, o + 11, 42, 3, '#b5d0e6');
      rect(ctx, w - 42, o + 11, 1, 20, OUTLINE);
      // Brick facade
      const wall = '#b86b4b';
      rect(ctx, 2, top, w - 4, o + h - top, OUTLINE);
      rect(ctx, 3, top, w - 6, o + h - top - 1, wall);
      for (let y = top + 3; y < o + h - 1; y += 4) {
        const offset = ((y - top) / 4) % 2 < 1 ? 0 : 4;
        rect(ctx, 3, y, w - 6, 1, shade(wall, -0.15));
        for (let x = 3 + offset; x < w - 3; x += 8) rect(ctx, x, y - 3, 1, 3, shade(wall, -0.15));
      }
      for (const [x, y] of OFFICE_WINDOWS) window(ctx, x, top + y, 14, 11, false);
      // Glass doors under a sign.
      const door = OFFICE_DOOR_X;
      rect(ctx, door - 2, o + h - 24, 2 * TILE + 4, 24, OUTLINE);
      rect(ctx, door, o + h - 22, 2 * TILE, 22, '#6d8fb0');
      rect(ctx, door + TILE - 1, o + h - 22, 2, 22, OUTLINE);
      rect(ctx, door + 2, o + h - 20, 3, 16, '#a9c5de');
      rect(ctx, door + TILE + 3, o + h - 20, 3, 16, '#a9c5de');
      rect(ctx, door - 6, o + h - 31, 2 * TILE + 12, 6, '#2f3a33');
      rect(ctx, door + 4, o + h - 29, 2 * TILE - 8, 2, '#e8dfae');
    },
    lit(ctx, _w, h, o) {
      for (const [x, y] of OFFICE_WINDOWS) window(ctx, x, officeFacade(o, h) + y, 14, 11, true);
    },
  },

  terrace: house(),
  house: house(),
  detached: house(),

  pond: {
    up: 2,
    paint(ctx, w, h, o, seed) {
      pill(ctx, 0, o - 2, w, h + 1, '#5b7f4a', OUTLINE);
      pill(ctx, 3, o, w - 6, h - 4, '#3f7fa8');
      pill(ctx, 8, o + 3, w - 22, h - 14, '#5a9cc4');
      // Ripples, lily pads and reeds.
      for (let i = 0; i < 4; i++) rect(ctx, 14 + i * 18, o + 20 + (i % 2) * 14, 6, 1, '#8cc3e0');
      for (const [x, y] of [[20, 36], [58, 14], [70, 40]] as const) {
        pill(ctx, x, o + y, 7, 5, '#5f9e4a');
        dot(ctx, x + 3, o + y + 1, '#e98fb3');
      }
      for (const x of [5, 9, w - 10, w - 6]) {
        const tall = 6 + Math.floor(hash(x, 3, seed) * 5);
        rect(ctx, x, o + h - 8 - tall, 1, tall, '#4f7a38');
        rect(ctx, x, o + h - 8 - tall, 1, 2, '#7a5a3a');
      }
    },
  },

  siteTiny: site(),
  siteSmall: site(),

  // The Christmas tree on the Green: three tiers down to the trunk, a star, baubles by day and fairy lights after dark.
  christmasTree: {
    up: 28,
    paint(ctx, w, h, o) {
      const trunk = o + h - 10;
      rect(ctx, w / 2 - 8, o + h - 5, 16, 3, 'rgba(20,14,30,0.2)');
      rect(ctx, w / 2 - 3, trunk, 6, 7, OUTLINE);
      rect(ctx, w / 2 - 2, trunk, 4, 6, '#7a5436');
      for (const tier of TREE_TIERS) {
        for (let row = 0; row < TIER_ROWS; row++) {
          const half = tierHalf(tier, row);
          rect(ctx, w / 2 - half - 1, trunk - tier.bottom + row, half * 2 + 2, 1, OUTLINE);
          rect(ctx, w / 2 - half, trunk - tier.bottom + row, half * 2, 1, row % 5 === 0 ? '#2f6b3a' : '#3d8a45');
        }
      }
      star(ctx, w / 2, trunk - TREE_TIERS[0]!.bottom - 5, '#e7c14a');
      TREE_TIERS.forEach((tier, t) => {
        for (const [row, side, c] of [
          [6, -1, '#c8453a'],
          [10, 1, '#3f74b5'],
          [13, -1, '#e7aa2e'],
        ] as const) {
          dot(ctx, w / 2 + side * Math.max(1, tierHalf(tier, row) - 2 - t), trunk - tier.bottom + row, c);
        }
      });
    },
    lit(ctx, w, h, o) {
      const trunk = o + h - 10;
      star(ctx, w / 2, trunk - TREE_TIERS[0]!.bottom - 5, '#fff3b0');
      const colours = ['#ffd98a', '#ff8c8c', '#8cc8ff', '#b6ff9c'];
      let i = 0;
      // Along each tier's edge, both sides, and a string across its hem.
      for (const tier of TREE_TIERS) {
        for (let row = 3; row < TIER_ROWS; row += 3) {
          const half = tierHalf(tier, row);
          for (const side of [-1, 1]) dot(ctx, w / 2 + side * (half - 1) - (side > 0 ? 1 : 0), trunk - tier.bottom + row, colours[i++ % colours.length]!);
        }
        const hem = tierHalf(tier, TIER_ROWS - 1);
        for (let x = -hem + 2; x < hem - 1; x += 3) dot(ctx, w / 2 + x, trunk - tier.bottom + TIER_ROWS - 2, colours[i++ % colours.length]!);
      }
    },
  },

  // The bonfire: a stack of logs and pallets, burning after dark.
  bonfire: {
    up: 14,
    paint(ctx, w, h, o) {
      rect(ctx, 3, o + h - 6, w - 6, 4, 'rgba(20,14,30,0.25)');
      for (let i = 0; i < 7; i++) {
        const x = 6 + i * 3;
        rect(ctx, x, o - 6 + Math.abs(3 - i) * 2, 3, h - Math.abs(3 - i) * 2 + 2, OUTLINE);
        rect(ctx, x + 1, o - 5 + Math.abs(3 - i) * 2, 1, h - Math.abs(3 - i) * 2, i % 2 ? '#8a5a3b' : '#a0714c');
      }
      rect(ctx, 4, o + h - 8, w - 8, 3, OUTLINE);
      rect(ctx, 5, o + h - 7, w - 10, 1, '#b98452');
    },
    lit(ctx, _w, _h, o) {
      for (const [x, y, fw, fh, c] of [
        [8, 0, 16, 16, '#e4793a'],
        [10, -6, 12, 14, '#f4a93a'],
        [12, -12, 8, 12, '#ffd98a'],
        [14, -16, 4, 6, '#fff3b0'],
      ] as const) {
        pill(ctx, x, o + y, fw, fh, c);
      }
      for (const [x, y] of [
        [6, -14],
        [25, -10],
        [11, -20],
        [21, -22],
      ] as const) {
        dot(ctx, x, o + y, '#ffd98a');
      }
    },
  },
  siteLarge: site(),
  startupSmall: startup(false),
  startupLarge: startup(true),

  lot: {
    up: 10,
    sortOffset: -5 * TILE,
    paint(ctx, w, h, o) {
      // Rough ground, a rope fence on posts, and a TO LET board.
      for (let y = o + 4; y < o + h - 2; y += 3) {
        for (let x = 4; x < w - 4; x += 5) rect(ctx, x + ((y / 3) % 2) * 2, y, 2, 1, 'rgba(90,70,40,0.25)');
      }
      for (const x of [2, w / 2, w - 4]) {
        rect(ctx, x, o + 2, 2, 5, WOOD.line);
        rect(ctx, x, o + h - 8, 2, 5, WOOD.line);
      }
      rect(ctx, 3, o + 3, w - 6, 1, '#d8c7a0');
      rect(ctx, 3, o + h - 7, w - 6, 1, '#d8c7a0');
      rect(ctx, w / 2 - 1, o - 4, 2, 16, WOOD.line);
      rect(ctx, w / 2 - 14, o - 10, 28, 11, OUTLINE);
      rect(ctx, w / 2 - 13, o - 9, 26, 9, '#f4efe2');
      rect(ctx, w / 2 - 13, o - 9, 26, 3, '#c8453a');
      for (let x = w / 2 - 10; x < w / 2 + 10; x += 3) rect(ctx, x, o - 4, 2, 2, '#44546a');
    },
  },

  foodTruck: {
    up: 12,
    paint(ctx, w, h, o, _seed, def) {
      const style = TRUCKS.find(([word]) => def.label?.includes(word))?.[1] ?? TRUCKS[0]![1];
      // Body, serving hatch with awning facing the park, wheels.
      rect(ctx, 0, o - 10, w, h + 6, OUTLINE);
      rect(ctx, 1, o - 9, w - 2, h + 4, style.body);
      rect(ctx, 1, o - 9, w - 2, 2, shade(style.body, 0.25));
      rect(ctx, w - 12, o - 8, 10, 8, '#8fb0cc');
      rect(ctx, w - 11, o - 7, 8, 2, '#c9dcea');
      rect(ctx, 4, o + 2, 28, 12, OUTLINE);
      rect(ctx, 5, o + 3, 26, 10, '#3a2a22');
      rect(ctx, 6, o + 9, 24, 3, '#e8dcc0');
      for (let x = 3; x < 33; x += 4) rect(ctx, x, o, 4, 3, x % 8 === 3 ? style.stripe : '#ffffff');
      rect(ctx, 3, o + 3, 30, 1, 'rgba(0,0,0,0.25)');
      pill(ctx, 8, o - 7, 20, 6, '#ffffff', OUTLINE);
      rect(ctx, 11, o - 5, 14, 2, style.stripe);
      for (const x of [5, w - 12]) {
        pill(ctx, x, o + h - 5, 7, 6, OUTLINE);
        rect(ctx, x + 2, o + h - 3, 3, 2, METAL.mid);
      }
    },
  },

  tree: {
    up: 26,
    paint(ctx, w, h, o, seed) {
      rect(ctx, w / 2 - 4, o + h - 5, 8, 3, 'rgba(20,14,30,0.2)');
      rect(ctx, w / 2 - 3, o + 6, 6, h - 8, OUTLINE);
      rect(ctx, w / 2 - 2, o + 6, 4, h - 9, '#7a5436');
      rect(ctx, w / 2 - 2, o + 6, 1, h - 9, '#9a7050');
      canopy(ctx, w / 2, o - 6, 13, seed * 1000);
    },
  },

  bush: {
    up: 4,
    paint(ctx, w, h, o, seed) {
      canopy(ctx, w / 2, o + h / 2 - 1, 6, seed * 1000);
      if (seed > 0.5) for (const [x, y] of [[5, 5], [10, 7], [7, 10]] as const) dot(ctx, x, o + y, '#f3a3c0');
    },
  },

  flowers: {
    up: 0,
    flat: true,
    paint(ctx, _w, _h, o, seed) {
      const colors = ['#e84855', '#f3c969', '#f5a3c0', '#b7a4f5', '#ffffff'];
      for (let i = 0; i < 6; i++) {
        const x = 2 + Math.floor(hash(i, 1, seed * 30) * 12);
        const y = o + 3 + Math.floor(hash(i, 2, seed * 30) * 10);
        rect(ctx, x, y + 1, 1, 2, '#3f8f4a');
        dot(ctx, x, y, colors[Math.floor(hash(i, 3, seed * 30) * colors.length)]!);
      }
    },
  },

  // A picnic: a checked blanket on the grass, and a basket on it.
  picnicBlanket: {
    up: 4,
    flat: true,
    paint(ctx, w, h, o) {
      rect(ctx, 1, o + 1, w - 2, h - 2, '#c8453a');
      for (let y = 0; y < h - 2; y += 4) for (let x = (y / 4) % 2 ? 4 : 0; x < w - 2; x += 8) rect(ctx, 1 + x, o + 1 + y, 4, 4, '#f4ede0');
      rect(ctx, 1, o + h - 2, w - 2, 1, 'rgba(20,14,30,0.25)');
      // The basket, by one corner.
      rect(ctx, w - 11, o - 2, 8, 6, OUTLINE);
      rect(ctx, w - 10, o - 1, 6, 4, '#b98452');
      rect(ctx, w - 10, o - 1, 6, 1, '#d09b67');
      rect(ctx, w - 9, o - 4, 4, 1, OUTLINE);
      dot(ctx, w - 9, o - 3, OUTLINE);
      dot(ctx, w - 6, o - 3, OUTLINE);
    },
  },

  bench: {
    up: 6,
    paint(ctx, w, h, o) {
      rect(ctx, 2, o + 6, 2, h - 6, METAL.line);
      rect(ctx, w - 4, o + 6, 2, h - 6, METAL.line);
      for (const y of [-6, -2]) {
        rect(ctx, 0, o + y, w, 3, WOOD.line);
        rect(ctx, 1, o + y + 1, w - 2, 1, WOOD.top);
      }
      for (const y of [3, 6]) {
        rect(ctx, 0, o + y, w, 3, WOOD.line);
        rect(ctx, 1, o + y, w - 2, 2, WOOD.top);
        rect(ctx, 1, o + y, w - 2, 1, WOOD.light);
      }
    },
  },

  // A billboard on two posts, its spotlight in the panel (render/spotlights.ts), with lamps on top that light it at night.
  billboard: {
    up: 50,
    paint(ctx, w, h, o) {
      rect(ctx, 14, o + h - 3, 52, 3, 'rgba(20,14,30,0.2)');
      for (const x of [18, w - 21]) {
        rect(ctx, x, o - 12, 3, h + 10, OUTLINE);
        rect(ctx, x + 1, o - 12, 1, h + 9, METAL.light);
      }
      rect(ctx, 2, o - 48, w - 4, 38, OUTLINE);
      rect(ctx, 3, o - 47, w - 6, 36, '#e6eaee');
      rect(ctx, 4, o - 46, w - 8, 34, '#2b2838');
      // The walkway along the bottom, and the lamps' arms over the top.
      rect(ctx, 1, o - 11, w - 2, 2, METAL.line);
      for (const x of [16, w - 22]) {
        rect(ctx, x + 2, o - 50, 1, 3, OUTLINE);
        rect(ctx, x, o - 51, 6, 2, OUTLINE);
      }
    },
    lit(ctx, w, _h, o) {
      for (const x of [16, w - 22]) rect(ctx, x + 1, o - 50, 4, 1, WINDOW_LIT);
    },
    poster: (w, _h, o) => [4, o - 46, w - 8, 34],
  },

  // A bus shelter: a roof on posts, glass behind a bench, the stop's roundel, and a poster case at the end.
  busStop: {
    up: 34,
    paint(ctx, w, h, o) {
      rect(ctx, 0, o + h - 3, w, 3, 'rgba(20,14,30,0.18)');
      // Glass along the back.
      rect(ctx, 2, o - 21, w - 16, 17, 'rgba(170,210,230,0.45)');
      rect(ctx, 2, o - 13, w - 16, 1, 'rgba(255,255,255,0.35)');
      // Posts and roof.
      for (const x of [1, w - 15]) rect(ctx, x, o - 22, 2, h + 20, OUTLINE);
      rect(ctx, 0, o - 26, w, 4, OUTLINE);
      rect(ctx, 1, o - 25, w - 2, 2, '#5a6b7a');
      // The bench.
      rect(ctx, 4, o + 1, w - 20, 3, WOOD.line);
      rect(ctx, 5, o + 1, w - 22, 1, WOOD.top);
      rect(ctx, 6, o + 4, 2, 5, METAL.line);
      rect(ctx, w - 20, o + 4, 2, 5, METAL.line);
      // The poster case at the end.
      rect(ctx, w - 14, o - 22, 14, 28, OUTLINE);
      rect(ctx, w - 13, o - 21, 12, 26, '#2b2838');
      // The stop's roundel on a pole.
      rect(ctx, 3, o - 33, 1, 8, OUTLINE);
      pill(ctx, 0, o - 34, 8, 7, '#d8413a', OUTLINE);
      rect(ctx, 1, o - 31, 6, 1, '#ffffff');
    },
    lit(ctx, w, _h, o) {
      rect(ctx, 3, o - 22, w - 18, 1, WINDOW_LIT);
    },
    poster: (w, _h, o) => [w - 13, o - 21, 12, 26],
  },

  lamppost: {
    up: 30,
    paint(ctx, w, h, o) {
      rect(ctx, w / 2 - 2, o + h - 3, 4, 3, OUTLINE);
      rect(ctx, w / 2 - 1, o - 22, 2, h + 20, '#3b3f4f');
      pill(ctx, w / 2 - 4, o - 30, 8, 9, OUTLINE);
      rect(ctx, w / 2 - 3, o - 28, 6, 5, '#8f96a3');
    },
    lit(ctx, w, _h, o) {
      rect(ctx, w / 2 - 3, o - 28, 6, 5, WINDOW_LIT);
      rect(ctx, w / 2 - 2, o - 27, 4, 2, '#fffbe6');
    },
  },

  evCharger: {
    up: 12,
    paint(ctx, w, h, o) {
      // A post with a little screen and a lightning bolt, its cable coiled on the side.
      rect(ctx, w / 2 - 4, o + h - 3, 8, 3, 'rgba(20,14,30,0.2)');
      rect(ctx, w / 2 - 4, o - 12, 8, h + 10, OUTLINE);
      rect(ctx, w / 2 - 3, o - 11, 6, h + 8, '#e6eaee');
      rect(ctx, w / 2 - 3, o - 11, 6, 2, '#3fae6a');
      rect(ctx, w / 2 - 2, o - 7, 4, 3, '#1f2b3a');
      for (const [x, y] of [[1, 0], [0, 1], [1, 1], [0, 2]] as const) dot(ctx, w / 2 - 1 + x, o - 1 + y, '#f3c969');
      rect(ctx, w / 2 + 4, o - 2, 2, 7, OUTLINE);
    },
  },

  chargingCanopy: {
    up: 30,
    paint(ctx, w, h, o) {
      chargingRoof(ctx, w, h, o, false);
    },
    lit(ctx, w, h, o) {
      chargingRoof(ctx, w, h, o, true);
    },
  },

  parkingBay: bay('#ecebe4'),
  chargingBay: bay('#3fae6a'),
};

/** The charging station's canopy: a flat roof on two posts, its green fascia signed with a car and a lightning bolt. Lit, the sign glows. */
function chargingRoof(ctx: Ctx, w: number, h: number, o: number, lit: boolean): void {
  const green = lit ? '#5fd08a' : '#3fae6a';
  // Shade under the roof, and the posts.
  rect(ctx, 0, o, w, h, 'rgba(20,14,30,0.12)');
  for (const x of [6, w - 10]) {
    rect(ctx, x, o - 16, 4, h + 14, OUTLINE);
    rect(ctx, x + 1, o - 16, 2, h + 13, METAL.mid);
  }
  // The roof: its top, then the fascia along the front.
  rect(ctx, 0, o - 30, w, 18, OUTLINE);
  rect(ctx, 1, o - 29, w - 2, 5, '#e6eaee');
  rect(ctx, 1, o - 24, w - 2, 11, green);
  rect(ctx, 1, o - 24, w - 2, 1, shade(green, 0.3));
  rect(ctx, 1, o - 14, w - 2, 1, shade(green, -0.3));
  // The sign: a white car, then a yellow bolt.
  const cx = w / 2 - 12;
  const y = o - 22;
  rect(ctx, cx + 3, y + 1, 8, 3, '#ffffff');
  rect(ctx, cx + 1, y + 4, 12, 3, '#ffffff');
  rect(ctx, cx + 2, y + 7, 2, 1, OUTLINE);
  rect(ctx, cx + 10, y + 7, 2, 1, OUTLINE);
  rect(ctx, cx + 4, y + 2, 6, 1, green);
  const bolt = lit ? '#fff3a0' : '#f3c969';
  for (const [x, by, bw] of [[4, 0, 2], [3, 1, 2], [2, 2, 4], [3, 3, 2], [3, 4, 1], [2, 5, 1]] as const) rect(ctx, cx + 16 + x, y + by + 1, bw, 1, bolt);
}

/** A bay marked out on the tarmac: lines either side and across the back. */
function bay(line: string): Painter {
  return {
    up: 0,
    flat: true,
    paint(ctx, w, h, o) {
      rect(ctx, 0, o - 2, 1, h + 2, line);
      rect(ctx, w - 1, o - 2, 1, h + 2, line);
      rect(ctx, 0, o - 2, w, 1, line);
    },
  };
}

const TRUCKS: [string, { body: string; stripe: string }][] = [
  ['Taco', { body: '#e7aa2e', stripe: '#c8453a' }],
  ['Noodle', { body: '#c8453a', stripe: '#1f2b3a' }],
  ['Pizza', { body: '#379463', stripe: '#e84855' }],
];

/** A modern office: flat roof, glass front. `large` fills a whole lot; small sits in the middle of it. */
function startup(large: boolean): Painter {
  return {
    up: 8,
    paint(ctx, w, h, o, seed) {
      const accent = ['#3f74b5', '#7f4aa6', '#1f9e95', '#e4793a'][Math.floor(seed * 4)]!;
      const facade = large ? 40 : 30;
      const top = o + h - facade;
      rect(ctx, 0, o - 8, w, top - o + 9, OUTLINE);
      rect(ctx, 1, o - 7, w - 2, top - o + 7, '#8b93a3');
      rect(ctx, 3, o - 5, w - 6, top - o + 3, '#a3aab8');
      if (large) {
        rect(ctx, 10, o + 2, 16, 10, METAL.line);
        rect(ctx, 11, o + 3, 14, 8, METAL.mid);
        rect(ctx, w - 40, o + 4, 30, 14, '#7fa6c9');
        rect(ctx, w - 40, o + 4, 30, 3, '#b5d0e6');
      }
      rect(ctx, 1, top, w - 2, o + h - top, OUTLINE);
      rect(ctx, 2, top, w - 4, o + h - top - 1, '#e8e6e1');
      rect(ctx, 2, top, w - 4, 3, accent);
      // Glass front with mullions; the door sits on the lot's door tile.
      const door = large ? 4 * TILE : 2 * TILE;
      for (let x = 5; x < w - 5; x += 9) {
        if (x + 8 > door - 2 && x < door + TILE + 2) continue;
        rect(ctx, x, top + 6, 8, facade - 12, OUTLINE);
        rect(ctx, x + 1, top + 7, 6, facade - 14, '#6d8fb0');
        rect(ctx, x + 1, top + 7, 2, facade - 14, '#a9c5de');
      }
      rect(ctx, door, o + h - 22, TILE, 22, OUTLINE);
      rect(ctx, door + 1, o + h - 21, TILE - 2, 21, '#6d8fb0');
      rect(ctx, door + 7, o + h - 21, 1, 21, OUTLINE);
      rect(ctx, door - 4, top + 4, TILE + 8, 2, accent);
    },
    lit(ctx, w, h, o) {
      const facade = large ? 40 : 30;
      const top = o + h - facade;
      const door = large ? 4 * TILE : 2 * TILE;
      for (let x = 5; x < w - 5; x += 9) {
        if (x + 8 > door - 2 && x < door + TILE + 2) continue;
        rect(ctx, x + 1, top + 7, 6, facade - 14, WINDOW_LIT);
      }
    },
  };
}


/** A building site: fence and materials, then foundations, a frame, walls behind scaffolding. */
/** The Green's Christmas tree: three tiers, each overlapping the one below, the lowest down to the trunk. `bottom` is how far above the trunk a tier starts. */
const TIER_ROWS = 16;
const TREE_TIERS = [
  { bottom: 40, widest: 6 },
  { bottom: 28, widest: 10 },
  { bottom: 16, widest: 14 },
];

/** How far a tier reaches either side of the middle, `row` rows down it. */
function tierHalf(tier: { widest: number }, row: number): number {
  return Math.max(1, Math.round(((row + 2) / TIER_ROWS) * tier.widest));
}

/** A little star: a cross with a bright middle. */
function star(ctx: Ctx, cx: number, y: number, colour: string): void {
  rect(ctx, cx - 1, y, 2, 5, colour);
  rect(ctx, cx - 3, y + 2, 6, 1, colour);
}

function site(): Painter {
  return {
    up: 26,
    stages: SITE_STAGES,
    paint(ctx, w, h, o, seed, def) {
      const stage = Math.min(SITE_STAGES - 1, Math.floor((def.progress ?? 0) * SITE_STAGES));
      const base = o + h - 2;
      // Churned-up ground inside a hoarding fence.
      rect(ctx, 1, o + 2, w - 2, h - 4, '#9a7a55');
      for (let i = 0; i < 30; i++) dot(ctx, 2 + Math.floor(hash(i, 1, seed) * (w - 4)), o + 3 + Math.floor(hash(i, 2, seed) * (h - 6)), '#7a5c3c');
      if (stage >= 1) {
        // Foundations
        rect(ctx, 4, base - 6, w - 8, 6, '#b9b3aa');
        rect(ctx, 4, base - 6, w - 8, 1, '#d5d0c8');
      }
      if (stage >= 2) {
        // Steel frame going up
        const top = o - (stage === 3 ? 22 : 12);
        for (let x = 5; x < w - 5; x += 12) rect(ctx, x, top, 2, base - 6 - top, '#c8453a');
        for (let y = top; y < base - 6; y += 8) rect(ctx, 5, y, w - 10, 1, '#c8453a');
      }
      if (stage >= 3) {
        // Walls behind scaffolding
        rect(ctx, 6, o - 14, w - 12, base - 6 - (o - 14), '#e8e6e1');
        for (let x = 3; x < w - 3; x += 6) rect(ctx, x, o - 20, 1, base - (o - 20), METAL.dark);
        for (let y = o - 20; y < base; y += 7) rect(ctx, 3, y, w - 6, 1, METAL.mid);
      }
      // Materials: a pallet of bricks and some pipes.
      rect(ctx, 3, base - 5, 7, 4, '#b0442f');
      rect(ctx, 3, base - 5, 7, 1, '#cf6a50');
      rect(ctx, w - 12, base - 3, 9, 1, METAL.dark);
      rect(ctx, w - 12, base - 5, 9, 1, METAL.dark);
      // Hoarding and a sign.
      for (let x = 0; x < w; x += 4) rect(ctx, x, o + h - 6, 3, 6, x % 8 === 0 ? '#f3c969' : '#3a3542');
      rect(ctx, 0, o + h - 6, w, 1, OUTLINE);
      rect(ctx, w / 2 - 10, o + h - 12, 20, 7, OUTLINE);
      rect(ctx, w / 2 - 9, o + h - 11, 18, 5, '#f3c969');
      rect(ctx, w / 2 - 6, o + h - 9, 12, 1, OUTLINE);
    },
  };
}
