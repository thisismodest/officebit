// Shared bits of furniture art: materials, desk bases, chairs, screens, leaves.
import type { FurnitureDef } from '../../sim/world.ts';
import { OUTLINE, hash, shade } from '../palette.ts';
import { dot, pill, rect, type Ctx } from '../pixels.ts';

export type Rect = [x: number, y: number, w: number, h: number];

/**
 * How to paint one furniture type. The canvas is the footprint plus `up`
 * pixels above (tall things) and `down` below; `o` is the footprint's top.
 */
export interface Painter {
  up: number;
  down?: number;
  /** Sort line relative to the footprint's bottom edge. */
  sortOffset?: number;
  /** Lies flat on the floor (rugs): drawn under everything. */
  flat?: boolean;
  /** Painted this many times with `def.progress` from 0 upwards (building sites). */
  stages?: number;
  /** `joins`: whether another of the same stands right up against it on the left or the right (a terrace in a row). */
  paint(ctx: Ctx, w: number, h: number, o: number, seed: number, def: FurnitureDef, joins?: Joins): void;
  /** A screen that lights up while in use, in canvas pixels. */
  screen?: (w: number, h: number, o: number) => Rect;
  /** Where the spotlight goes on a billboard or poster (render/spotlights.ts), in canvas pixels: drawn live, as the spotlights take turns. */
  poster?: (w: number, h: number, o: number) => Rect;
  /** Paints lit windows on top of the day image, for nights with someone home. */
  lit?: (ctx: Ctx, w: number, h: number, o: number, seed: number, def: FurnitureDef, joins?: Joins) => void;
}

/** Whether a piece has another of the same kind joined on at either side. */
export interface Joins {
  left: boolean;
  right: boolean;
  /** Tile-sized pieces (hedges, fences) also join above and below. */
  up?: boolean;
  down?: boolean;
}

export const WOOD = { top: '#b98452', light: '#d09b67', dark: '#8a5a35', line: '#5a3822' };
export const DARK_WOOD = { top: '#6e4a33', light: '#8a6044', dark: '#4e3322', line: '#2f1d12' };
export const METAL = { light: '#e6eaee', mid: '#b9c1c9', dark: '#7d8791', line: '#4f5761' };
export const WINDOW_LIT = '#ffd98a';

/** Desktop with front panel and legs, `w` wide. */
export function deskBase(ctx: Ctx, w: number, h: number, o: number, wood = WOOD): void {
  rect(ctx, 0, o, w, 12, wood.line);
  rect(ctx, 1, o + 1, w - 2, 9, wood.top);
  rect(ctx, 1, o + 1, w - 2, 1, wood.light);
  rect(ctx, 1, o + 10, w - 2, 1, wood.dark);
  rect(ctx, 2, o + 12, 3, h - 12, wood.line);
  rect(ctx, w - 5, o + 12, 3, h - 12, wood.line);
  rect(ctx, 3, o + 12, 1, h - 13, wood.dark);
  rect(ctx, w - 4, o + 12, 1, h - 13, wood.dark);
  rect(ctx, 5, o + 12, w - 10, 2, wood.dark);
}

/** Office chair seen from above, on the tile starting at y = `top`. */
export function chair(ctx: Ctx, x: number, top: number, color = '#4b4f6b'): void {
  pill(ctx, x + 3, top + 2, 10, 9, color, OUTLINE);
  rect(ctx, x + 4, top + 3, 8, 1, shade(color, 0.2));
  rect(ctx, x + 7, top + 11, 2, 2, OUTLINE);
  rect(ctx, x + 4, top + 13, 8, 1, OUTLINE);
  for (const dx of [3, 8, 12]) dot(ctx, x + dx, top + 14, OUTLINE);
}

/** A monitor with a stand; its screen shows lines of "code" in `colors`. */
export function monitor(ctx: Ctx, x: number, y: number, w: number, seed: number, colors = CODE_COLORS): void {
  rect(ctx, x, y, w, 11, OUTLINE);
  rect(ctx, x + 1, y + 1, w - 2, 9, '#2c3040');
  rect(ctx, x + 2, y + 2, w - 4, 7, '#18222f');
  for (let line = 0; line < 3; line++) {
    let cx = x + 3 + Math.floor(hash(line, 1, seed * 97) * 2);
    const end = x + 3 + Math.floor((w - 6) * (0.5 + hash(line, 2, seed * 97) * 0.5));
    while (cx < end) {
      const len = 1 + Math.floor(hash(cx, line, seed * 31) * 3);
      rect(ctx, cx, y + 3 + line * 2, Math.min(len, end - cx), 1, colors[Math.floor(hash(cx, line, seed * 13) * colors.length)]!);
      cx += len + 1;
    }
  }
  rect(ctx, x + 2, y + 2, w - 4, 1, 'rgba(255,255,255,0.12)');
  const mid = x + Math.floor(w / 2) - 1;
  rect(ctx, mid, y + 11, 2, 2, OUTLINE);
  rect(ctx, mid - 2, y + 12, 6, 1, OUTLINE);
}

export const CODE_COLORS = ['#7fd1ff', '#9be38a', '#f3c969', '#e98fb3', '#b7a4f5'];

export function keyboard(ctx: Ctx, x: number, y: number): void {
  rect(ctx, x, y, 13, 4, METAL.dark);
  rect(ctx, x + 1, y + 1, 11, 2, METAL.light);
  for (let kx = x + 1; kx < x + 12; kx += 2) dot(ctx, kx, y + 1, METAL.mid);
  for (let kx = x + 2; kx < x + 11; kx += 2) dot(ctx, kx, y + 2, METAL.mid);
}

export function mug(ctx: Ctx, x: number, y: number, color = '#f4f1ea'): void {
  rect(ctx, x, y, 5, 6, OUTLINE);
  rect(ctx, x + 1, y + 1, 3, 4, color);
  rect(ctx, x + 1, y + 1, 3, 1, '#6b3f25');
  dot(ctx, x + 5, y + 2, OUTLINE);
  dot(ctx, x + 5, y + 3, OUTLINE);
}

export function paper(ctx: Ctx, x: number, y: number, w = 6, h = 6): void {
  rect(ctx, x, y + 1, w, h, METAL.mid);
  rect(ctx, x, y, w, h, '#fbfaf5');
  rect(ctx, x + 1, y + 2, w - 2, 1, METAL.mid);
  rect(ctx, x + 1, y + 4, w - 3, 1, METAL.mid);
}

/** A kitchen counter: worktop and cupboard doors. */
export function counterBase(ctx: Ctx, w: number, h: number, o: number): void {
  rect(ctx, 0, o, w, h, '#5a4636');
  rect(ctx, 0, o, w, 5, '#cfd4d9');
  rect(ctx, 0, o, w, 1, '#eef1f4');
  rect(ctx, 0, o + 5, w, 1, '#3d2f25');
  rect(ctx, 1, o + 6, w - 2, h - 7, '#8f7a64');
  rect(ctx, w / 2, o + 6, 1, h - 7, '#5a4636');
  dot(ctx, w / 2 - 2, o + 9, '#cfd4d9');
  dot(ctx, w / 2 + 2, o + 9, '#cfd4d9');
}

export function tableTop(ctx: Ctx, w: number, h: number, o: number, fill: string, plank: string, line: string): void {
  // Legs peek out below the apron.
  rect(ctx, 2, o + h - 4, 3, 4, line);
  rect(ctx, w - 5, o + h - 4, 3, 4, line);
  pill(ctx, 0, o, w, h - 3, fill, line);
  for (let y = o + 6; y < o + h - 6; y += 6) rect(ctx, 1, y, w - 2, 1, plank);
  rect(ctx, 1, o + 1, w - 2, 1, shade(fill, 0.2));
  rect(ctx, 1, o + h - 6, w - 2, 2, shade(fill, -0.25));
}

/** Foliage: a fan of outlined curved strokes from (cx, baseY). */
export function leaves(ctx: Ctx, cx: number, baseY: number, seed: number, count: number, length: number, spread = 0.42): void {
  const pixels = new Set<string>();
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i - (count - 1) / 2) * spread + (hash(i, 1, seed * 50) - 0.5) * 0.3;
    const len = length * (0.6 + hash(i, 2, seed * 50) * 0.4);
    for (let t = 0; t < len; t += 0.5) {
      const x = Math.round(cx + Math.cos(angle) * t);
      const y = Math.round(baseY + Math.sin(angle) * t + (t * t) / 40);
      pixels.add(`${x},${y}`);
      if (t > 2 && t < len - 2) pixels.add(`${x + 1},${y}`);
    }
  }
  const points = [...pixels].map((p) => p.split(',').map(Number) as [number, number]);
  for (const [x, y] of points) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) dot(ctx, x + dx, y + dy, '#1f4a2a');
  for (const [x, y] of points) dot(ctx, x, y, hash(x, y, 9) > 0.5 ? '#3f8f4a' : '#4fa258');
  for (const [x, y] of points) if (hash(x, y, 10) > 0.8) dot(ctx, x, y, '#7cc47f');
}

/** A round, bushy canopy (trees, hedges). */
export function canopy(ctx: Ctx, cx: number, cy: number, r: number, seed: number): void {
  const inside = (x: number, y: number) => {
    const wobble = hash(Math.round(Math.atan2(y, x) * 4), 0, seed) * 1.6;
    return x * x + y * y <= (r + wobble) ** 2;
  };
  for (let y = -r - 2; y <= r + 2; y++) {
    for (let x = -r - 2; x <= r + 2; x++) {
      if (!inside(x, y)) continue;
      const edge = !inside(x + 1, y) || !inside(x - 1, y) || !inside(x, y + 1) || !inside(x, y - 1);
      const lit = x + y < -r / 2;
      const color = edge ? '#1f4a2a' : lit ? '#6fb563' : hash(cx + x, cy + y, seed) > 0.75 ? '#3d8a45' : '#4f9e52';
      dot(ctx, cx + x, cy + y, color);
    }
  }
}
