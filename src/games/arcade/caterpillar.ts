// Caterpillar (docs/GAMES.md#caterpillar): steer a caterpillar round the garden eating leaves; each one makes it longer
// (and a little quicker). Running into the garden wall or into itself ends a round. It starts slow.
import type { Tile } from '../../sim/world.ts';
import { DELTA, OPPOSITE, type Dir, type Input } from '../controls.ts';
import { SCREEN, box, write, type ArcadeGame, type Round } from './game.ts';

/** The garden: cells of this many pixels, under a strip for the score. */
const CELL = 8;
const TOP = 16;
const COLS = SCREEN.w / CELL;
const ROWS = (SCREEN.h - TOP) / CELL;
/** Seconds per move: to start with, the quickest it gets, and how much quicker each leaf makes it. */
const START_PACE = 0.26;
const FASTEST = 0.1;
const QUICKER = 0.008;
const START_LENGTH = 3;
/** Turns pressed ahead (a quick up-then-left is both), and how far into a move a turn makes it move now rather than wait. */
const QUEUE = 2;
const EARLY = 0.35;

const GRASS = ['#5f9e4a', '#58944a'];
const BODY = ['#8fd14f', '#6fb83a'];
const LEAF = '#2f7a32';

export class Caterpillar implements Round {
  /** Head first. */
  body: Tile[];
  heading: Dir = 'right';
  leaf: Tile;
  score = 0;
  over = false;
  pace = START_PACE;
  /** Turns pressed, taken one a move. */
  private turns: Dir[] = [];
  private timer = 0;
  private grow = 0;
  private readonly random: () => number;

  constructor(random: () => number) {
    this.random = random;
    const [x, y] = [Math.floor(COLS / 3), Math.floor(ROWS / 2)];
    this.body = Array.from({ length: START_LENGTH }, (_, i): Tile => [x - i, y]);
    this.leaf = this.freeCell();
  }

  step(input: Input, dt: number): void {
    if (this.over) return;
    // Each way pressed, in turn (never straight back on itself, nor the way it's already going).
    for (const key of input.pressed) {
      const after = this.turns.at(-1) ?? this.heading;
      if (key === 'a' || key === after || key === OPPOSITE[after] || this.turns.length >= QUEUE) continue;
      this.turns.push(key);
      // Most of the way to the next move already: turn now, so it answers the stick straight away.
      if (this.timer >= this.pace * EARLY) this.timer = this.pace;
    }
    this.timer += dt;
    while (this.timer >= this.pace && !this.over) {
      this.timer -= this.pace;
      this.move();
    }
  }

  private move(): void {
    this.heading = this.turns.shift() ?? this.heading;
    const [dx, dy] = DELTA[this.heading];
    const [hx, hy] = this.body[0]!;
    const head: Tile = [hx + dx, hy + dy];
    // The tail moves on (unless it's growing), so the head may take its place.
    const rest = this.grow > 0 ? this.body : this.body.slice(0, -1);
    const wall = head[0] < 0 || head[1] < 0 || head[0] >= COLS || head[1] >= ROWS;
    if (wall || rest.some(([x, y]) => x === head[0] && y === head[1])) {
      this.over = true;
      return;
    }
    this.body.unshift(head);
    if (head[0] === this.leaf[0] && head[1] === this.leaf[1]) {
      this.score++;
      this.grow++;
      this.pace = Math.max(FASTEST, this.pace - QUICKER);
      this.leaf = this.freeCell();
    }
    if (this.grow > 0) this.grow--;
    else this.body.pop();
  }

  /** Somewhere for the next leaf, clear of the caterpillar. */
  private freeCell(): Tile {
    for (;;) {
      const cell: Tile = [Math.floor(this.random() * COLS), Math.floor(this.random() * ROWS)];
      if (!this.body.some(([x, y]) => x === cell[0] && y === cell[1])) return cell;
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) box(ctx, x * CELL, TOP + y * CELL, CELL, CELL, GRASS[(x + y) % 2]!);
    box(ctx, 0, 0, SCREEN.w, TOP, '#2a2033');
    write(ctx, `LEAVES ${this.score}`, 4, 4, '#f3c969');
    // The leaf, swaying.
    const [lx, ly] = this.leaf;
    const sway = Math.round(Math.sin(time * 4));
    box(ctx, lx * CELL + 2 + sway, TOP + ly * CELL + 1, 4, 6, LEAF);
    box(ctx, lx * CELL + 3 + sway, TOP + ly * CELL + 2, 2, 4, '#4fae4a');
    box(ctx, lx * CELL + 4, TOP + ly * CELL + 6, 1, 2, '#6b4a33');
    // Tail to head, so the head's on top.
    for (let i = this.body.length - 1; i >= 0; i--) {
      const [x, y] = this.body[i]!;
      const [px, py] = [x * CELL, TOP + y * CELL];
      box(ctx, px + 1, py + 1, CELL - 2, CELL - 2, '#2a2033');
      box(ctx, px + 1, py + 2, CELL - 2, CELL - 4, BODY[i % 2]!);
      box(ctx, px + 2, py + 1, CELL - 4, CELL - 2, BODY[i % 2]!);
      if (i === 0) this.face(ctx, px, py);
    }
  }

  /** Eyes looking the way it's going, and a smile. */
  private face(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const [dx, dy] = DELTA[this.heading];
    const eyes: Tile[] = dx !== 0 ? [[4 + dx, 2], [4 + dx, 5]] : [[2, 4 + dy], [5, 4 + dy]];
    for (const [ex, ey] of eyes) {
      box(ctx, px + ex - 1, py + ey - 1, 2, 2, '#ffffff');
      box(ctx, px + ex - 1 + Math.max(0, dx), py + ey - 1 + Math.max(0, dy), 1, 1, '#1b1422');
    }
    box(ctx, px + 2, py - 1, 1, 2, '#2a2033');
    box(ctx, px + 5, py - 1, 1, 2, '#2a2033');
  }
}

export const CATERPILLAR: ArcadeGame = {
  id: 'caterpillar',
  name: 'Caterpillar',
  icon: '🐛',
  how: 'Eat the leaves! Don’t bump into the walls or yourself.',
  start: (random) => new Caterpillar(random),
};
