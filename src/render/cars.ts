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

/** The bus (sim/buses.ts): a green and cream single-decker, nearly three tiles long, and as wide as a car end on. */
const BUS = { body: '#2f8f5b', band: '#efe3c2', length: 44, side: 16, end: 13 };

/** The bus, facing `heading`. */
export function busSprite(heading: Heading): HTMLCanvasElement {
  const key = `bus-${heading}`;
  let sprite = sprites.get(key);
  if (!sprite) {
    const across = heading === 'left' || heading === 'right';
    const { canvas: c, ctx } = canvas(across ? BUS.length : BUS.end, across ? BUS.side : BUS.length);
    if (across) busSide(ctx, heading === 'left');
    else busEnd(ctx, heading === 'up');
    sprites.set(key, c);
    sprite = c;
  }
  return sprite;
}

/** Side on: a long box, a row of windows over a cream band, the door up front, wheels fore and aft. */
function busSide(ctx: Ctx, left: boolean): void {
  const w = BUS.length;
  const h = BUS.side;
  const x = (px: number, width: number) => (left ? px : w - px - width);
  rect(ctx, 1, h - 2, w - 2, 2, 'rgba(20,14,30,0.25)');
  rect(ctx, 0, 0, w, h - 2, OUTLINE);
  rect(ctx, 1, 1, w - 2, h - 4, BUS.body);
  rect(ctx, 1, 1, w - 2, 1, shade(BUS.body, 0.25));
  rect(ctx, 1, 8, w - 2, 2, BUS.band);
  for (let px = 7; px < w - 4; px += 6) rect(ctx, x(px, 4), 3, 4, 4, GLASS);
  // The windscreen and the door, at the front.
  rect(ctx, x(1, 4), 2, 4, 6, GLASS);
  rect(ctx, x(1, 3), 9, 3, 3, shade(BUS.body, -0.3));
  rect(ctx, x(1, 2), 11, 2, 1, '#e8dfae');
  rect(ctx, x(w - 3, 2), 11, 2, 1, '#b8433a');
  for (const px of [6, w - 11]) rect(ctx, px, h - 3, 6, 2, TYRE);
}

/** Nose or tail on: a tall narrow front, the windscreen and destination board, lamps below. */
function busEnd(ctx: Ctx, away: boolean): void {
  const w = BUS.end;
  const l = BUS.length;
  rect(ctx, 1, l - 2, w - 2, 2, 'rgba(20,14,30,0.25)');
  rect(ctx, 0, 0, w, l - 2, OUTLINE);
  rect(ctx, 1, 1, w - 2, l - 4, BUS.body);
  rect(ctx, 1, 1, 1, l - 4, shade(BUS.body, 0.25));
  rect(ctx, 2, 4, w - 4, l - 12, shade(BUS.body, 0.1));
  // The roof's cream stripe, and glass at whichever end we're looking at.
  rect(ctx, w / 2 - 1, 5, 2, l - 14, BUS.band);
  const [front, back] = away ? [1, l - 6] : [l - 6, 1];
  rect(ctx, 2, away ? 2 : l - 10, w - 4, 4, GLASS);
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
    left: [[[0, 6]], [[w - 2, 6]]],
    right: [[[w - 2, 6]], [[0, 6]]],
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
