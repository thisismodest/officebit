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
