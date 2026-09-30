// Seasonal touches on the town map (docs/RENDERING.md#seasons): fairy lights
// along the eaves after dark in December, pumpkins on doorsteps in the week of
// Halloween, and fireworks over the Green on Bonfire Night and at New Year.
// All from the date and the clock, so they never touch the story.
import { hourOf } from '../sim/clock.ts';
import { doorOf } from '../sim/geometry.ts';
import { festive } from '../sim/holidays.ts';
import type { Simulation } from '../sim/sim.ts';
import { OUTLINE, hash } from './palette.ts';
import { TILE, dot, rect, type Ctx } from './pixels.ts';
import type { Prop } from './props/index.ts';

/** Houses that get fairy lights and pumpkins. */
const HOUSES = new Set(['terrace', 'house', 'detached']);
/** Fairy lights hang this far above the bottom of a house's picture (its eaves: props/outdoor.ts). */
const EAVES = 30;
const FAIRY = ['#ffd98a', '#ff8c8c', '#8cc8ff', '#b6ff9c'];
/** Fireworks go up over the middle of the Green (tiles). */
const FIREWORKS_OVER: [number, number] = [54, 37];
/** A burst every so often (ticks), lasting this long, climbing for this share of it. */
const BURST_EVERY = 6;
const BURST_TICKS = 14;
const CLIMB = 0.3;
const SPARKS = 18;
const COLOURS = ['#ff6b6b', '#ffd93d', '#6bcBff', '#b18cff', '#7dff9c', '#ffffff'];

export interface Burst {
  id: number;
  /** Where it bursts (world pixels), and how far through it is, 0–1. */
  x: number;
  y: number;
  age: number;
  colour: string;
}

/** Fireworks in the sky at this tick: Bonfire Night 19:00–21:00, and around midnight at New Year. */
export function fireworksAt(sim: Simulation, tick: number): Burst[] {
  const hour = hourOf(tick);
  const date = sim.dateOf(tick);
  const on =
    (date.month === 11 && date.day === 5 && hour >= 19 && hour < 21) ||
    (date.month === 12 && date.day === 31 && hour >= 23.9) ||
    (date.month === 1 && date.day === 1 && hour < 0.4);
  if (!on) return [];
  const bursts: Burst[] = [];
  const slot = Math.floor(tick / BURST_EVERY);
  for (let s = slot - Math.ceil(BURST_TICKS / BURST_EVERY); s <= slot; s++) {
    for (let k = 0; k < 3; k++) {
      const id = s * 3 + k;
      if (k > 0 && hash(id, 7, 1) < 0.45) continue;
      const start = s * BURST_EVERY + hash(id, 1, 1) * BURST_EVERY;
      const age = (tick - start) / BURST_TICKS;
      if (age < 0 || age >= 1) continue;
      const [cx, cy] = FIREWORKS_OVER;
      bursts.push({
        id,
        x: (cx + (hash(id, 2, 1) - 0.5) * 18) * TILE,
        y: (cy - 7 - hash(id, 3, 1) * 5) * TILE,
        age,
        colour: COLOURS[Math.floor(hash(id, 4, 1) * COLOURS.length)]!,
      });
    }
  }
  return bursts;
}

/** Paint the season's touches over the town (after the dark, so they glow). */
export function paintSeasonal(ctx: Ctx, sim: Simulation, props: Prop[], night: number, time: number, tick: number): void {
  const date = sim.dateOf(tick);
  const houses = props.filter((prop) => HOUSES.has(prop.item.def.t) && !prop.item.gone);
  if (festive(date)) {
    const trees = treesIndoors(sim);
    for (const prop of houses) {
      if (!prop.item.def.owner) continue;
      decorate(ctx, prop, night > 0.3, time, trees.has(prop.item.index));
    }
  }
  if (date.month === 10 && date.day >= 24) {
    for (const prop of houses) {
      if (!prop.item.def.owner) continue;
      const [dx, dy] = doorOf(prop.item.def);
      pumpkin(ctx, (dx + 1) * TILE + 2, dy * TILE + (prop.item.def.faces === 'up' ? 9 : 3), night > 0.3);
    }
  }
  for (const burst of fireworksAt(sim, tick)) paintBurst(ctx, burst);
}

/** Where the houses' pictures put things (props/outdoor.ts): the ridge, the eaves, the front door and the first front window. */
const RIDGE_INSET = 8;
const DOOR = { x: TILE + 8, top: 21 };
const WINDOW = { x: 3, top: 25, w: 10, h: 10 };

/** A house at Christmas: a wreath on the door, and after dark fairy lights round the roof and a tree in the window. */
function decorate(ctx: Ctx, prop: Prop, dark: boolean, time: number, tree: boolean): void {
  const { x: left, y: top, img } = prop;
  const w = img.width;
  const back = prop.item.def.faces === 'up';
  const bottom = top + img.height;
  const eaves = bottom - EAVES;
  const ridge = back ? top + 22 : top;
  if (!back) wreath(ctx, left + DOOR.x, bottom - DOOR.top + 1);
  if (!dark) return;
  // A string of bulbs along the ridge, down both slopes and along the eaves, twinkling.
  const twinkle = Math.floor(time / 450);
  const bulbs: [number, number][] = [];
  for (let x = RIDGE_INSET; x <= w - RIDGE_INSET; x += 4) bulbs.push([x, ridge - top]);
  for (let d = 2; d < RIDGE_INSET; d += 3) bulbs.push([RIDGE_INSET - d, ridge - top + d], [w - RIDGE_INSET + d - 2, ridge - top + d]);
  for (let x = 1; x < w - 2; x += 4) bulbs.push([x, eaves - top]);
  bulbs.forEach(([x, y], i) => {
    if ((i + twinkle) % 7 === 0) return;
    rect(ctx, left + x, top + y, 2, 2, FAIRY[(i + Math.floor(twinkle / 3)) % FAIRY.length]!);
  });
  // The tree they put up, glowing in the front window.
  if (tree && !back) {
    const wx = left + WINDOW.x;
    const wy = bottom - WINDOW.top;
    rect(ctx, wx + 1, wy + 1, WINDOW.w - 2, WINDOW.h - 2, '#ffe6a8');
    for (let row = 0; row < 7; row++) rect(ctx, wx + WINDOW.w / 2 - Math.ceil(row / 2) - 1, wy + 2 + row, Math.ceil(row / 2) * 2 + 2, 1, '#2f6b3a');
    dot(ctx, wx + WINDOW.w / 2 - 1, wy + 1, '#f4c542');
    dot(ctx, wx + 3, wy + 6, '#ff8c8c');
    dot(ctx, wx + WINDOW.w - 4, wy + 5, '#8cc8ff');
  }
}

/** A holly wreath with a red bow, on a front door. */
function wreath(ctx: Ctx, cx: number, y: number): void {
  rect(ctx, cx - 3, y, 6, 1, '#2f6b3a');
  rect(ctx, cx - 4, y + 1, 8, 4, '#2f6b3a');
  rect(ctx, cx - 3, y + 5, 6, 1, '#2f6b3a');
  rect(ctx, cx - 2, y + 2, 4, 2, '#3d4a5a');
  dot(ctx, cx - 3, y + 1, '#c8453a');
  dot(ctx, cx + 2, y + 4, '#c8453a');
  rect(ctx, cx - 1, y + 5, 2, 2, '#c8453a');
}

/** Houses (by their index among items) whose home has a tree up indoors. */
function treesIndoors(sim: Simulation): Set<number> {
  const trees = new Set(sim.activeItems().filter((i) => i.def.t === 'homeTree').map((i) => sim.baseOf(i.level)));
  return new Set(sim.housing.homes().filter((h) => trees.has(h.level.id)).map((h) => h.item.index));
}

function pumpkin(ctx: Ctx, x: number, y: number, lit: boolean): void {
  rect(ctx, x, y + 1, 7, 5, OUTLINE);
  rect(ctx, x + 1, y + 1, 5, 4, '#e4793a');
  rect(ctx, x + 1, y + 1, 1, 4, '#c4602a');
  dot(ctx, x + 3, y, '#3d8a45');
  const face = lit ? '#ffd98a' : '#8a3a1a';
  dot(ctx, x + 2, y + 2, face);
  dot(ctx, x + 4, y + 2, face);
  rect(ctx, x + 2, y + 4, 3, 1, face);
}

/** A rocket climbing, then a ring of sparks spreading and falling as it fades, with a flash as it bursts. */
function paintBurst(ctx: Ctx, { x, y, age, colour, id }: Burst): void {
  if (age < CLIMB) {
    const rise = age / CLIMB;
    const at = y + (1 - rise) * 7 * TILE;
    rect(ctx, x, at, 2, 2, '#fff3b0');
    rect(ctx, x, at + 3, 2, 3, 'rgba(255,217,138,0.45)');
    return;
  }
  const spread = (age - CLIMB) / (1 - CLIMB);
  if (spread < 0.2) {
    ctx.globalAlpha = 0.35 * (1 - spread / 0.2);
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [trail, alpha, size] of [
    [0.75, 0.45, 1],
    [1, 1, 2],
  ] as const) {
    ctx.globalAlpha = alpha * (1 - spread * 0.8);
    for (let i = 0; i < SPARKS; i++) {
      const angle = (i / SPARKS) * Math.PI * 2 + hash(id, 5, 1);
      const r = (6 + spread * 38) * trail;
      rect(ctx, Math.round(x + Math.cos(angle) * r), Math.round(y + Math.sin(angle) * r + spread * spread * 14), size, size, i % 3 ? colour : '#ffffff');
    }
  }
  ctx.globalAlpha = 1;
}
