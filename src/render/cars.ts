// Cars (docs/RENDERING.md#sprites): seen from above, a little from the front,
// in a handful of paint jobs, sized to sit inside a one-tile lane. One sprite
// per paint job and direction, cached; lights are drawn separately, at night.
import type { Heading } from '../sim/movement.ts';
import { OUTLINE, shade } from './palette.ts';
import { TILE, canvas, rect, type Ctx } from './pixels.ts';

const PAINT = ['#c8453a', '#3f5a7a', '#e8dcc4', '#2f2b36', '#e7aa2e', '#4f6b3a', '#9fb3c8', '#a07a9a'];
const GLASS = '#8fb0cc';
const TYRE = '#1f1b24';
/** A car's length, and its height side on / width end on, in pixels: well inside a 16px lane. */
const LENGTH = 22;
const SIDE_H = 12;
const END_W = 11;
const HEADLIGHT = '#fff6c4';
const TAIL_LIGHT = '#ff5d5d';

const sprites = new Map<string, HTMLCanvasElement>();

/** A car facing `heading`, in the paint job `look` (0–1) picks. */
export function carSprite(look: number, heading: Heading): HTMLCanvasElement {
  const paint = PAINT[Math.floor(look * PAINT.length) % PAINT.length]!;
  const key = `${paint}-${heading}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const across = heading === 'left' || heading === 'right';
    const { canvas: c, ctx } = canvas(across ? LENGTH : END_W, across ? SIDE_H : LENGTH);
    if (across) side(ctx, paint, heading === 'left');
    else end(ctx, paint, heading === 'up');
    sprites.set(key, c);
    sprite = c;
  }
  return sprite;
}

/** A long vehicle's look: its colours, its size side on (length and height) and end on (width), and whether it's the bus (rows of windows) or a van (a serving hatch). In scale with people (21px tall): taller than them. */
interface Long {
  body: string;
  band: string;
  length: number;
  height: number;
  width: number;
  bus: boolean;
}

/** The bus (sim/buses.ts): a green and cream single-decker, three tiles long, and a bit wider than a van. */
const BUS: Long = { body: '#2f8f5b', band: '#efe3c2', length: 48, height: 32, width: 18, bus: true };
/** A food truck on the move, hatch shut, in its own colours. */
const VAN = { length: 40, height: 27, width: 15 };

/** The bus, facing `heading`. */
export function busSprite(heading: Heading): HTMLCanvasElement {
  return longSprite(BUS, heading);
}

/** A food truck driving to or from its pitch (it opens up only once parked), facing `heading`. */
export function vanSprite(colours: { body: string; stripe: string }, heading: Heading): HTMLCanvasElement {
  return longSprite({ body: colours.body, band: colours.stripe, ...VAN, bus: false }, heading);
}

/** Where to draw a bus or a van: side on, standing on its lane (wheels at the lane's foot, body rising up the screen); end on, centred on it. */
export function longOrigin(sprite: HTMLCanvasElement, x: number, y: number, heading: Heading): [number, number] {
  const across = heading === 'left' || heading === 'right';
  const left = Math.round(x * TILE + (TILE - sprite.width) / 2);
  return [left, across ? Math.round((y + 1) * TILE - sprite.height + 1) : Math.round(y * TILE + (TILE - sprite.height) / 2)];
}

function longSprite(look: Long, heading: Heading): HTMLCanvasElement {
  const key = `${look.bus ? 'bus' : 'van'}-${look.body}-${heading}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const across = heading === 'left' || heading === 'right';
    const { canvas: c, ctx } = canvas(across ? look.length : look.width, across ? look.height : look.length);
    if (across) longSide(ctx, look, heading === 'left');
    else longEnd(ctx, look, heading === 'up');
    sprites.set(key, c);
    sprite = c;
  }
  return sprite;
}

/** Side on: a tall box, a coloured band low down, wheels fore and aft; the bus has windows the length of it and a door up front, a van its shut hatch and a sign on the roof. */
function longSide(ctx: Ctx, look: Long, left: boolean): void {
  const w = look.length;
  const h = look.height;
  const x = (px: number, width: number) => (left ? px : w - px - width);
  const band = h - 11;
  rect(ctx, 1, h - 2, w - 2, 2, 'rgba(20,14,30,0.25)');
  rect(ctx, 0, 0, w, h - 3, OUTLINE);
  rect(ctx, 1, 1, w - 2, h - 5, look.body);
  rect(ctx, 1, 1, w - 2, 2, shade(look.body, 0.25));
  rect(ctx, 1, band, w - 2, 3, look.band);
  if (look.bus) {
    for (let px = 9; px < w - 5; px += 7) rect(ctx, x(px, 5), 5, 5, band - 8, GLASS);
    // The door, up front.
    rect(ctx, x(7, 1), 4, 1, h - 8, OUTLINE);
    rect(ctx, x(2, 4), band - 3, 4, 3, shade(look.body, -0.3));
  } else {
    // The serving hatch, shut, down the side, and a sign on the roof.
    rect(ctx, x(13, w - 17), 5, w - 17, band - 8, shade(look.body, -0.2));
    rect(ctx, x(13, w - 17), 5, w - 17, 1, OUTLINE);
    rect(ctx, x(16, w - 23), 2, w - 23, 2, look.band);
  }
  // The windscreen at the front, lamps at either end, wheels.
  rect(ctx, x(1, 5), 4, 5, band - 6, GLASS);
  rect(ctx, x(1, 2), h - 6, 2, 2, '#e8dfae');
  rect(ctx, x(w - 3, 2), h - 6, 2, 2, '#b8433a');
  for (const px of [7, w - 14]) rect(ctx, px, h - 4, 7, 3, TYRE);
}

/** Nose or tail on: a long narrow roof with its stripe, glass at the end we're looking at, lamps. */
function longEnd(ctx: Ctx, look: Long, away: boolean): void {
  const w = look.width;
  const l = look.length;
  rect(ctx, 1, l - 2, w - 2, 2, 'rgba(20,14,30,0.25)');
  rect(ctx, 0, 0, w, l - 2, OUTLINE);
  rect(ctx, 1, 1, w - 2, l - 4, look.body);
  rect(ctx, 1, 1, 1, l - 4, shade(look.body, 0.25));
  rect(ctx, 2, 5, w - 4, l - 14, shade(look.body, 0.1));
  rect(ctx, Math.floor(w / 2) - 1, 6, 2, l - 16, look.band);
  rect(ctx, 2, away ? 2 : l - 11, w - 4, 5, GLASS);
  const [front, back] = away ? [1, l - 6] : [l - 6, 1];
  for (const px of [1, w - 3]) {
    rect(ctx, px, front, 2, 2, '#e8dfae');
    rect(ctx, px, back, 2, 2, '#b8433a');
  }
}

/** Where to draw a car's sprite so it's centred on its tile, in world pixels. */
export function carOrigin(sprite: HTMLCanvasElement, x: number, y: number): [number, number] {
  return [Math.round(x * TILE + (TILE - sprite.width) / 2), Math.round(y * TILE + (TILE - sprite.height) / 2)];
}

/** Its lights, lit, over the dark: headlights at the front, tail lights at the back. `[x, y]` is the sprite's origin. */
export function paintCarLights(ctx: Ctx, sprite: HTMLCanvasElement, [x, y]: [number, number], heading: Heading): void {
  const { width: w, height: h } = sprite;
  const lamps: Record<Heading, [front: [number, number][], back: [number, number][]]> = {
    left: [[[0, h - 6]], [[w - 2, h - 6]]],
    right: [[[w - 2, h - 6]], [[0, h - 6]]],
    up: [[[1, 0], [w - 3, 0]], [[1, h - 3], [w - 3, h - 3]]],
    down: [[[1, h - 3], [w - 3, h - 3]], [[1, 0], [w - 3, 0]]],
  };
  const [front, back] = lamps[heading];
  for (const [dx, dy] of front) rect(ctx, x + dx, y + dy, 2, 2, HEADLIGHT);
  for (const [dx, dy] of back) rect(ctx, x + dx, y + dy, 2, 2, TAIL_LIGHT);
}

/** Side on, driving across the screen: roof and windows, bonnet at the front. */
function side(ctx: Ctx, paint: string, left: boolean): void {
  const w = LENGTH;
  const x = (px: number, width: number) => (left ? px : w - px - width);
  rect(ctx, 1, SIDE_H - 2, w - 2, 2, 'rgba(20,14,30,0.25)');
  rect(ctx, 0, 3, w, SIDE_H - 5, OUTLINE);
  rect(ctx, 1, 4, w - 2, SIDE_H - 7, paint);
  rect(ctx, 1, 4, w - 2, 1, shade(paint, 0.25));
  // Cabin: set back from the bonnet.
  rect(ctx, x(6, 11), 0, 11, 5, OUTLINE);
  rect(ctx, x(7, 9), 1, 9, 3, shade(paint, 0.1));
  rect(ctx, x(8, 3), 1, 3, 2, GLASS);
  rect(ctx, x(12, 3), 1, 3, 2, GLASS);
  rect(ctx, x(1, 2), 6, 2, 2, '#e8dfae');
  rect(ctx, x(w - 3, 2), 6, 2, 2, '#b8433a');
  for (const px of [3, w - 8]) rect(ctx, px, SIDE_H - 3, 5, 2, TYRE);
}

/** Nose or tail on, driving up or down the screen. */
function end(ctx: Ctx, paint: string, away: boolean): void {
  const w = END_W;
  rect(ctx, 1, LENGTH - 2, w - 2, 2, 'rgba(20,14,30,0.25)');
  rect(ctx, 0, 0, w, LENGTH - 2, OUTLINE);
  rect(ctx, 1, 1, w - 2, LENGTH - 4, paint);
  rect(ctx, 1, 1, 1, LENGTH - 4, shade(paint, 0.25));
  // Roof, windscreen at the front and a rear window at the back.
  rect(ctx, 2, away ? 4 : 6, w - 4, 10, shade(paint, 0.1));
  rect(ctx, 2, away ? 4 : 13, w - 4, 3, GLASS);
  rect(ctx, 2, away ? 12 : 6, w - 4, 2, shade(GLASS, -0.2));
  // Headlights at the front, tail lights at the back.
  const [front, back] = away ? [1, LENGTH - 5] : [LENGTH - 5, 1];
  for (const px of [1, w - 3]) {
    rect(ctx, px, front, 2, 2, '#e8dfae');
    rect(ctx, px, back, 2, 2, '#b8433a');
  }
}
