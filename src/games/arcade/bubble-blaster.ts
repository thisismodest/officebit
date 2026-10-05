// Bubble Blaster (docs/GAMES.md#bubble-blaster): aim the launcher and fire coloured bubbles up at the ones packed in at
// the top. Three or more of a colour touching pop, and any left hanging with nothing holding them up fall too. Every few
// shots the whole lot comes down a row; reaching the launcher's line ends a round. Clear them all for a fresh lot.
import type { Input } from '../controls.ts';
import { SCREEN, box, disc, line, write, type ArcadeGame, type Round } from './game.ts';

/** The strip at the top for the score. */
const TOP = 12;
/** A bubble's size (px), the columns across, and the rows the bubbles may come down to before the round's over. */
const SIZE = 10;
const COLS = 15;
const ROWS = 11;
/** Where the honeycomb starts (px from the left), so it sits in the middle; and how far apart its rows are (px). */
const LEFT = (SCREEN.w - COLS * SIZE - SIZE / 2) / 2;
const ROW_H = 9;
/** The launcher: where it sits, how fast it turns (radians a second), and how far either side of straight up it aims. */
const LAUNCHER = { x: SCREEN.w / 2, y: SCREEN.h - 10, turn: 1.6, widest: 1.35 };
/** How fast a bubble flies (px/s). */
const SPEED = 190;
/** Rows of bubbles to start with, how many shots before they come down a row, and how many touching make a pop. */
const START_ROWS = 5;
const SHOTS_PER_ROW = 7;
const POP = 3;
const COLOURS = ['#e94f4f', '#4f8fd6', '#f3c969', '#5fb35a'];

/** The honeycomb: rows of cells, each a colour (an index into COLOURS) or empty. */
type Cell = number | null;

export class BubbleBlaster implements Round {
  /** Top row first. */
  grid: Cell[][] = [];
  /** Which way the launcher points: radians from straight up (left is negative). */
  aim = 0;
  /** The bubble on the launcher, and the one after it. */
  loaded: number;
  next: number;
  /** The bubble in flight, if there is one. */
  flying: { x: number; y: number; vx: number; vy: number; colour: number } | null = null;
  /** Bubbles falling or popping, for show. */
  falling: { x: number; y: number; vy: number; colour: number }[] = [];
  score = 0;
  over = false;
  /** Shots since the bubbles last came down. */
  shots = 0;
  /** Whether the top row sits half a bubble in (the rows alternate; it flips each time they come down). */
  private shifted = false;
  private readonly random: () => number;

  constructor(random: () => number) {
    this.random = random;
    this.fresh();
    this.loaded = this.pick();
    this.next = this.pick();
  }

  step(input: Input, dt: number): void {
    for (const b of this.falling) {
      b.vy += 300 * dt;
      b.y += b.vy * dt;
    }
    this.falling = this.falling.filter((b) => b.y < SCREEN.h + SIZE);
    if (this.over) return;
    const turning = (input.held.has('right') ? 1 : 0) - (input.held.has('left') ? 1 : 0);
    this.aim = clamp(this.aim + turning * LAUNCHER.turn * dt, -LAUNCHER.widest, LAUNCHER.widest);
    // A finger on the screen aims at it; letting go there fires.
    const finger = input.tap ?? input.pointer;
    if (finger && finger.y < LAUNCHER.y - 4) this.aim = clamp(Math.atan2(finger.x - LAUNCHER.x, LAUNCHER.y - finger.y), -LAUNCHER.widest, LAUNCHER.widest);
    // Not on a swipe up (that's a finger aiming), only the go button or a tap.
    if (!this.flying && (input.pressed.has('a') || input.tap)) this.fire();
    if (this.flying) this.fly(dt);
  }

  private fire(): void {
    this.flying = { x: LAUNCHER.x, y: LAUNCHER.y, vx: Math.sin(this.aim) * SPEED, vy: -Math.cos(this.aim) * SPEED, colour: this.loaded };
    this.loaded = this.next;
    this.next = this.pick();
  }

  /** On, in small steps (so it never skips past a bubble), bouncing off the sides, till it sticks. */
  private fly(dt: number): void {
    const b = this.flying!;
    const steps = Math.ceil((SPEED * dt) / 2);
    for (let i = 0; i < steps; i++) {
      b.x += (b.vx * dt) / steps;
      b.y += (b.vy * dt) / steps;
      const [lo, hi] = [LEFT + SIZE / 2, LEFT + COLS * SIZE];
      if (b.x < lo || b.x > hi) {
        b.vx = -b.vx;
        b.x = clamp(b.x, lo, hi);
      }
      if (b.y <= TOP + SIZE / 2 || this.touching(b.x, b.y)) {
        this.stick(b.x, b.y, b.colour);
        return;
      }
    }
  }

  /** Is a flying bubble here up against one in the honeycomb? */
  private touching(x: number, y: number): boolean {
    for (const [r, row] of this.grid.entries())
      for (const [c, cell] of row.entries()) {
        if (cell === null) continue;
        const [cx, cy] = this.centre(r, c);
        if (Math.hypot(cx - x, cy - y) < SIZE - 1) return true;
      }
    return false;
  }

  /** Into the nearest empty cell; then any pop, any that fall, and the rows coming down. */
  private stick(x: number, y: number, colour: number): void {
    this.flying = null;
    let best: [number, number] | null = null;
    let bestDistance = Infinity;
    for (let r = 0; r < ROWS + 1; r++)
      for (let c = 0; c < COLS; c++) {
        if (this.at(r, c) !== null || (r > 0 && !this.neighbours(r, c).some(([nr, nc]) => this.at(nr, nc) !== null))) continue;
        const [cx, cy] = this.centre(r, c);
        const d = Math.hypot(cx - x, cy - y);
        if (d < bestDistance) [best, bestDistance] = [[r, c], d];
      }
    if (!best) return;
    const [r, c] = best;
    while (this.grid.length <= r) this.grid.push(Array(COLS).fill(null));
    this.grid[r]![c] = colour;
    const group = this.connected(r, c, (cell) => cell === colour);
    if (group.length >= POP) {
      for (const [gr, gc] of group) this.drop(gr, gc);
      this.score += group.length;
      // Anything no longer hanging from the top falls, for twice the points.
      const held = new Set(this.grid[0]!.flatMap((cell, gc) => (cell === null ? [] : this.connected(0, gc, (k) => k !== null).map(([a, b]) => `${a},${b}`))));
      for (const [gr, row] of this.grid.entries())
        for (const [gc, cell] of row.entries())
          if (cell !== null && !held.has(`${gr},${gc}`)) {
            this.drop(gr, gc);
            this.score += 2;
          }
    } else if (++this.shots >= SHOTS_PER_ROW) this.comeDown();
    this.trim();
    if (this.grid.every((row) => row.every((cell) => cell === null))) {
      this.score += 10;
      this.fresh();
    }
    if (this.grid.length > ROWS) this.over = true;
    // Only colours still up there come next, so there's always something to aim at.
    const left = this.colours();
    if (left.length && !left.includes(this.loaded)) this.loaded = this.pick();
    if (left.length && !left.includes(this.next)) this.next = this.pick();
  }

  /** Down a row, a new row in at the top. */
  private comeDown(): void {
    this.shots = 0;
    this.shifted = !this.shifted;
    this.grid.unshift(Array.from({ length: COLS }, () => this.pick()));
  }

  /** Off the honeycomb, falling. */
  private drop(r: number, c: number): void {
    const [x, y] = this.centre(r, c);
    this.falling.push({ x, y, vy: -30, colour: this.grid[r]![c]! });
    this.grid[r]![c] = null;
  }

  /** Every cell joined to this one through cells that `match`. */
  private connected(r: number, c: number, match: (cell: Cell) => boolean): [number, number][] {
    const seen = new Set([`${r},${c}`]);
    const found: [number, number][] = [[r, c]];
    for (let i = 0; i < found.length; i++) {
      for (const [nr, nc] of this.neighbours(...found[i]!)) {
        if (seen.has(`${nr},${nc}`) || !match(this.at(nr, nc))) continue;
        seen.add(`${nr},${nc}`);
        found.push([nr, nc]);
      }
    }
    return found;
  }

  /** The six cells round one: either side, and two above and two below (which two depends on the row's offset). */
  private neighbours(r: number, c: number): [number, number][] {
    const d = this.offset(r) ? 0 : -1;
    return [[r, c - 1], [r, c + 1], [r - 1, c + d], [r - 1, c + d + 1], [r + 1, c + d], [r + 1, c + d + 1]];
  }

  private at(r: number, c: number): Cell {
    return r < 0 || c < 0 || c >= COLS ? null : (this.grid[r]?.[c] ?? null);
  }

  /** Does this row sit half a bubble in? */
  private offset(r: number): boolean {
    return (r % 2 === 1) !== this.shifted;
  }

  private centre(r: number, c: number): [number, number] {
    return [LEFT + c * SIZE + SIZE / 2 + (this.offset(r) ? SIZE / 2 : 0), TOP + SIZE / 2 + r * ROW_H];
  }

  /** No empty rows hanging off the bottom. */
  private trim(): void {
    while (this.grid.length && this.grid.at(-1)!.every((cell) => cell === null)) this.grid.pop();
  }

  private colours(): number[] {
    return [...new Set(this.grid.flat().filter((cell): cell is number => cell !== null))];
  }

  /** A colour for the launcher: one still up there. */
  private pick(): number {
    const left = this.colours();
    const from = left.length ? left : COLOURS.map((_, i) => i);
    return from[Math.floor(this.random() * from.length)]!;
  }

  /** A fresh lot at the top. */
  private fresh(): void {
    this.shifted = false;
    this.shots = 0;
    this.grid = Array.from({ length: START_ROWS }, () => Array.from({ length: COLS }, () => Math.floor(this.random() * COLOURS.length)));
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    box(ctx, 0, 0, SCREEN.w, SCREEN.h, '#1a2240');
    // The line they mustn't reach.
    const [, deadline] = this.centre(ROWS, 0);
    for (let x = 0; x < SCREEN.w; x += 4) box(ctx, x, deadline + SIZE / 2, 2, 1, '#4a5580');
    for (const [r, row] of this.grid.entries())
      for (const [c, cell] of row.entries()) if (cell !== null) bubble(ctx, ...this.centre(r, c), cell);
    for (const b of this.falling) bubble(ctx, b.x, b.y, b.colour);
    if (this.flying) bubble(ctx, this.flying.x, this.flying.y, this.flying.colour);
    // The aim: dots up the way it'll go.
    const [ax, ay] = [Math.sin(this.aim), -Math.cos(this.aim)];
    for (let d = 14; d < 44; d += 6) if (Math.floor(time * 6 + d) % 2 === 0) box(ctx, LAUNCHER.x + ax * d, LAUNCHER.y + ay * d, 1, 1, '#f4f4f0');
    line(ctx, LAUNCHER.x, LAUNCHER.y, LAUNCHER.x + ax * 10, LAUNCHER.y + ay * 10, '#c9c3d6');
    box(ctx, LAUNCHER.x - 9, LAUNCHER.y + 3, 18, 6, '#7f4aa6');
    bubble(ctx, LAUNCHER.x, LAUNCHER.y, this.loaded);
    write(ctx, 'NEXT', 8, SCREEN.h - 12, '#c9c3d6', { size: 7 });
    bubble(ctx, 34, SCREEN.h - 9, this.next);
    // How many shots till they come down, as pips.
    for (let i = 0; i < SHOTS_PER_ROW - this.shots; i++) box(ctx, SCREEN.w - 8 - i * 4, SCREEN.h - 8, 2, 2, '#9fd3f0');
    box(ctx, 0, 0, SCREEN.w, TOP, '#2a2033');
    write(ctx, `SCORE ${this.score}`, 4, 2, '#f3c969');
  }
}

/** A bubble: its colour, a darker rim, a shine. */
function bubble(ctx: CanvasRenderingContext2D, x: number, y: number, colour: number): void {
  disc(ctx, x, y, SIZE / 2 - 0.5, '#1b1422');
  disc(ctx, x, y, SIZE / 2 - 1.5, COLOURS[colour]!);
  box(ctx, x - 2, y - 3, 2, 2, '#ffffffaa');
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const BUBBLE_BLASTER: ArcadeGame = {
  id: 'bubbleBlaster',
  name: 'Bubble Blaster',
  icon: '🫧',
  how: 'Aim and fire. Three of a colour together pop!',
  start: (random) => new BubbleBlaster(random),
};
