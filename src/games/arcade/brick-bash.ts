// Brick Bash (docs/GAMES.md#brick-bash): bounce the ball off your bat to knock out the bricks. Three balls; clear the
// wall and a new one goes up, a little quicker. The bat's wide and the ball waits on it till you're ready.
import type { Input } from '../controls.ts';
import { SCREEN, box, prompt, write, type ArcadeGame, type Round } from './game.ts';

const TOP = 14;
const BAT = { w: 32, h: 4, y: SCREEN.h - 12, speed: 140 };
const BALL = 4;
/** Ball speed (px a second): to start with, and how much more each new wall. */
const SPEED = 80;
const FASTER = 10;
/** How steep a bounce off the bat's very end is (radians from straight up). */
const STEEPEST = 1.05;
const WALL = { cols: 8, rows: 5, w: 18, h: 7, gap: 2, top: TOP + 10 };
const ROWS = ['#e94f4f', '#e7793a', '#f3c969', '#5fb35a', '#4f8fd6'];
const BALLS = 3;

interface Brick {
  x: number;
  y: number;
  colour: string;
  hit: boolean;
}

export class BrickBash implements Round {
  bat = SCREEN.w / 2;
  ball = { x: 0, y: 0, vx: 0, vy: 0 };
  /** Resting on the bat, waiting to be sent off. */
  waiting = true;
  bricks: Brick[] = [];
  balls = BALLS;
  wall = 1;
  score = 0;
  over = false;

  constructor() {
    this.build();
  }

  step(input: Input, dt: number): void {
    if (this.over) return;
    // The bat: under a finger, or the arrows.
    if (input.pointer) this.bat = input.pointer.x;
    else this.bat += ((input.held.has('right') ? 1 : 0) - (input.held.has('left') ? 1 : 0)) * BAT.speed * dt;
    this.bat = Math.min(SCREEN.w - BAT.w / 2, Math.max(BAT.w / 2, this.bat));
    if (this.waiting) {
      this.ball.x = this.bat;
      this.ball.y = BAT.y - BALL;
      if (input.pressed.has('a') || input.pressed.has('up') || input.tap) this.serve();
      return;
    }
    // Small steps, so a quick ball never jumps a brick.
    const steps = Math.ceil((Math.hypot(this.ball.vx, this.ball.vy) * dt) / 2);
    for (let i = 0; i < steps && !this.waiting; i++) this.move(dt / steps);
  }

  private serve(): void {
    const speed = SPEED + (this.wall - 1) * FASTER;
    this.waiting = false;
    this.ball.vx = speed * 0.5;
    this.ball.vy = -speed * Math.sqrt(0.75);
  }

  private move(dt: number): void {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const r = BALL / 2;
    if (b.x < r || b.x > SCREEN.w - r) {
      b.vx = -b.vx;
      b.x = Math.min(SCREEN.w - r, Math.max(r, b.x));
    }
    if (b.y < TOP + r) {
      b.vy = Math.abs(b.vy);
      b.y = TOP + r;
    }
    // Off the bat: the further from its middle, the more to the side it goes.
    if (b.vy > 0 && b.y + r >= BAT.y && b.y + r <= BAT.y + BAT.h + 2 && Math.abs(b.x - this.bat) <= BAT.w / 2 + r) {
      const along = Math.max(-1, Math.min(1, (b.x - this.bat) / (BAT.w / 2)));
      const speed = Math.hypot(b.vx, b.vy);
      b.vx = speed * Math.sin(along * STEEPEST);
      b.vy = -speed * Math.cos(along * STEEPEST);
      b.y = BAT.y - r;
    }
    for (const brick of this.bricks) {
      if (brick.hit || b.x + r < brick.x || b.x - r > brick.x + WALL.w || b.y + r < brick.y || b.y - r > brick.y + WALL.h) continue;
      brick.hit = true;
      this.score++;
      // Back the way it came, across whichever side it went in by least.
      const overX = Math.min(b.x + r - brick.x, brick.x + WALL.w - (b.x - r));
      const overY = Math.min(b.y + r - brick.y, brick.y + WALL.h - (b.y - r));
      if (overX < overY) b.vx = -b.vx;
      else b.vy = -b.vy;
      break;
    }
    if (this.bricks.every((brick) => brick.hit)) {
      this.wall++;
      this.build();
      this.waiting = true;
    } else if (b.y - r > SCREEN.h) {
      this.balls--;
      this.over = this.balls === 0;
      this.waiting = true;
    }
  }

  /** A fresh wall of bricks. */
  private build(): void {
    const width = WALL.cols * WALL.w + (WALL.cols - 1) * WALL.gap;
    const left = (SCREEN.w - width) / 2;
    this.bricks = [];
    for (let row = 0; row < WALL.rows; row++) {
      for (let col = 0; col < WALL.cols; col++) {
        this.bricks.push({ x: left + col * (WALL.w + WALL.gap), y: WALL.top + row * (WALL.h + WALL.gap), colour: ROWS[row % ROWS.length]!, hit: false });
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    box(ctx, 0, 0, SCREEN.w, SCREEN.h, '#14182e');
    box(ctx, 0, 0, SCREEN.w, TOP, '#2a2033');
    write(ctx, `SCORE ${this.score}`, 4, 3, '#f3c969');
    for (let i = 0; i < this.balls; i++) box(ctx, SCREEN.w - 10 - i * 7, 5, BALL, BALL, '#f4f4f0');
    for (const brick of this.bricks) {
      if (brick.hit) continue;
      box(ctx, brick.x, brick.y, WALL.w, WALL.h, brick.colour);
      box(ctx, brick.x, brick.y, WALL.w, 1, '#ffffff55');
      box(ctx, brick.x, brick.y + WALL.h - 1, WALL.w, 1, '#00000055');
    }
    box(ctx, this.bat - BAT.w / 2, BAT.y, BAT.w, BAT.h, '#9fd3f0');
    box(ctx, this.bat - BAT.w / 2, BAT.y, BAT.w, 1, '#ffffff');
    box(ctx, this.ball.x - BALL / 2, this.ball.y - BALL / 2, BALL, BALL, '#f4f4f0');
    if (this.waiting && !this.over && Math.floor(time * 2) % 2 === 0) prompt(ctx, 'PRESS ◆ / SPACE', SCREEN.w / 2, SCREEN.h / 2 + 12, '#f4f4f0');
  }
}

export const BRICK_BASH: ArcadeGame = {
  id: 'brickBash',
  name: 'Brick Bash',
  icon: '🧱',
  how: 'Bounce the ball and knock out the bricks!',
  start: () => new BrickBash(),
};
