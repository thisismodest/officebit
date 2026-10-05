// What an arcade game is (docs/GAMES.md): a round on the cabinet's little screen, stepped and drawn a frame at a time,
// with a score and an end. Games never touch the town: they're played in front of it.
import type { Input } from '../controls.ts';
import { DIAMOND } from '../pixel.ts';

/** The cabinet's screen, in its own pixels (scaled up, crisp). */
export const SCREEN = { w: 160, h: 144 };

/** One go at a game. */
export interface Round {
  /** On by `dt` seconds. */
  step(input: Input, dt: number): void;
  /** The whole screen. `time`: seconds since the round began, for anything that bobs or blinks. */
  draw(ctx: CanvasRenderingContext2D, time: number): void;
  readonly score: number;
  readonly over: boolean;
}

export interface ArcadeGame {
  id: string;
  name: string;
  /** On the cabinet's menu. */
  icon: string;
  /** How to play, in a few words a child can follow. */
  how: string;
  start(random: () => number): Round;
}

/** Text on the screen: small, crisp, in the arcade's font. */
export function write(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string, { size = 8, align = 'left' }: { size?: number; align?: CanvasTextAlign } = {}): void {
  ctx.font = `bold ${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.fillStyle = colour;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

/** The go button's symbol in text: write `◆` and it's drawn as the button's pixel diamond (a font's own may not be there). */
const GO = '◆';

/** Centred text with the go button's diamond drawn where it says `◆` ("PRESS ◆ / SPACE"). */
export function prompt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, colour: string): void {
  ctx.font = 'bold 8px ui-monospace, Menlo, Consolas, monospace';
  const parts = text.split(GO);
  const icon = Math.max(...DIAMOND);
  const gap = 3;
  const widths = parts.map((p) => ctx.measureText(p).width);
  const total = widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * (icon + gap * 2);
  let at = Math.round(x - total / 2);
  for (const [i, part] of parts.entries()) {
    write(ctx, part, at, y, colour);
    at += widths[i]!;
    if (i === parts.length - 1) break;
    at += gap;
    // The go button's diamond, a pixel row at a time.
    for (const [row, across] of DIAMOND.entries()) box(ctx, at + (icon - across) / 2, y + row, across, 1, colour);
    at += icon + gap;
  }
}

/** Words into lines of at most `chars` characters, for text that has to fit the screen. */
export function wrap(text: string, chars: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= chars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
