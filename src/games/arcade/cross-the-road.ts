// Cross the Road (docs/GAMES.md#cross-the-road): hop across two busy roads, a pavement in the middle to catch your
// breath, without being caught by the cars and buses. Each crossing scores, and the traffic gets a little quicker.
// Three goes; caught, and it's back to the start.
import { DELTA, type Input } from '../controls.ts';
import { SCREEN, box, write, type ArcadeGame, type Round } from './game.ts';

/** The strip at the top for the score, the rows (px) and columns (px) a hop moves you by, and how many of each. */
const TOP = 12;
const ROW = 14;
const COL = 10;
const COLS = SCREEN.w / COL;
/** Rows, top to bottom: the far pavement, three lanes, the middle, three lanes, the near pavement. */
const LANES = [1, 2, 3, 5, 6, 7];
const START_ROW = 8;
const GOES = 3;
/** Traffic speed (px/s) in the first crossing, and how much quicker each crossing makes it (a share). */
const SPEED = [14, 26];
const QUICKER = 0.12;
/** How long a hop takes (s), and how long you stay caught before going back to the start. */
const HOP = 0.12;
const CAUGHT = 1;

/** Something on the road: a car or a bus, how long it is (px), its colour. */
interface Vehicle {
  x: number;
  length: number;
  colour: string;
  bus: boolean;
}

interface Lane {
  row: number;
  /** px a second: positive to the right. */
  speed: number;
  vehicles: Vehicle[];
  /** How long the lane's loop of traffic is (px, longer than the screen): off one end, a vehicle comes back on this far behind. */
  span: number;
}

const CARS = ['#e94f4f', '#4f8fd6', '#f3c969', '#9fd3f0', '#c9c3d6'];
const BUS = '#5fb35a';

export class CrossTheRoad implements Round {
  /** Where you are: a column and a row (moving between them while hopping). */
  col = Math.floor(COLS / 2);
  row = START_ROW;
  lanes: Lane[] = [];
  score = 0;
  goes = GOES;
  over = false;
  /** Crossings made: the traffic quickens with each. */
  crossings = 0;
  /** Seconds left caught (0: free to hop). */
  caught = 0;
  /** A hop under way: from where, and how far through (0–1). */
  private hop: { col: number; row: number; t: number } | null = null;
  private readonly random: () => number;

  constructor(random: () => number) {
    this.random = random;
    this.traffic();
  }

  step(input: Input, dt: number): void {
    if (this.over) return;
    for (const lane of this.lanes)
      for (const v of lane.vehicles) {
        v.x += lane.speed * dt;
        // Off one end, round to the other, keeping its place in the lane's loop (so the gaps stay as they were).
        if (lane.speed > 0 && v.x > SCREEN.w) v.x -= lane.span;
        if (lane.speed < 0 && v.x + v.length < 0) v.x += lane.span;
      }
    if (this.caught > 0) {
      this.caught = Math.max(0, this.caught - dt);
      if (this.caught === 0) [this.col, this.row] = [Math.floor(COLS / 2), START_ROW];
      return;
    }
    if (this.hop) {
      this.hop.t += dt / HOP;
      if (this.hop.t >= 1) this.hop = null;
    }
    // Landed (this step, even): one hop a press (a tap or a swipe up is a hop forward), within the screen.
    if (!this.hop) {
      const way = [...input.pressed].find((k) => k !== 'a') ?? (input.tap || input.pressed.has('a') ? 'up' : null);
      if (way) {
        const [dx, dy] = DELTA[way];
        const [col, row] = [this.col + dx, this.row + dy];
        if (col >= 0 && col < COLS && row >= 0 && row <= START_ROW) {
          this.hop = { col: this.col, row: this.row, t: 0 };
          [this.col, this.row] = [col, row];
        }
      }
    }
    if (this.hit()) {
      this.goes--;
      this.over = this.goes === 0;
      this.caught = CAUGHT;
      this.hop = null;
      return;
    }
    // Over the far pavement: a crossing made, and back to the start for the next, a little quicker.
    if (this.row === 0 && !this.hop) {
      this.score++;
      this.crossings++;
      [this.col, this.row] = [Math.floor(COLS / 2), START_ROW];
      for (const lane of this.lanes) lane.speed *= 1 + QUICKER;
    }
  }

  /** Is anything on the road where you are? (Only once you've landed: mid-hop, you're in the air.) */
  private hit(): boolean {
    if (this.hop) return false;
    const lane = this.lanes.find((l) => l.row === this.row);
    const [left, right] = [this.col * COL + 2, this.col * COL + COL - 2];
    return !!lane?.vehicles.some((v) => v.x < right && v.x + v.length > left);
  }

  /** Each lane's traffic: a way and a speed, and a few cars (now and then a bus) with gaps to hop through. */
  private traffic(): void {
    this.lanes = LANES.map((row, i) => {
      const way = i % 2 === 0 ? 1 : -1;
      const speed = way * (SPEED[0]! + this.random() * (SPEED[1]! - SPEED[0]!));
      const vehicles: Vehicle[] = [];
      let x = 0;
      while (x < SCREEN.w + 30) {
        const bus = this.random() < 0.2;
        const length = bus ? 30 : 14;
        vehicles.push({ x, length, colour: bus ? BUS : CARS[Math.floor(this.random() * CARS.length)]!, bus });
        x += length + 28 + this.random() * 40;
      }
      return { row, speed, vehicles, span: x };
    });
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const y = (row: number) => TOP + row * ROW;
    box(ctx, 0, TOP, SCREEN.w, SCREEN.h - TOP, '#3b3f4a');
    // Pavements top, middle and bottom; dashes between lanes.
    for (const row of [0, 4, START_ROW]) {
      box(ctx, 0, y(row), SCREEN.w, ROW, '#a59e8f');
      for (let x = 0; x < SCREEN.w; x += 8) box(ctx, x, y(row), 1, ROW, '#938c7e');
    }
    for (const row of [2, 3, 6, 7]) for (let x = 2; x < SCREEN.w; x += 12) box(ctx, x, y(row), 6, 1, '#d8d4c6');
    // The far pavement's a little garden: somewhere to get to.
    for (let x = 4; x < SCREEN.w; x += 16) box(ctx, x, y(0) + 3, 6, 6, '#5fb35a');
    for (const lane of this.lanes) for (const v of lane.vehicles) vehicle(ctx, v, y(lane.row), lane.speed > 0);
    this.drawYou(ctx, time, y);
    box(ctx, 0, 0, SCREEN.w, TOP, '#2a2033');
    write(ctx, `CROSSED ${this.score}`, 4, 2, '#f3c969');
    for (let i = 0; i < this.goes; i++) box(ctx, SCREEN.w - 8 - i * 7, 3, 4, 6, '#e94f4f');
  }

  private drawYou(ctx: CanvasRenderingContext2D, time: number, y: (row: number) => number): void {
    // Partway through a hop: between the two, and up in the air a little.
    const t = this.hop?.t ?? 1;
    const from = this.hop ?? { col: this.col, row: this.row };
    const px = (from.col + (this.col - from.col) * t) * COL + 2;
    const py = y(from.row + (this.row - from.row) * t) + 2 - Math.sin(t * Math.PI) * 3;
    if (this.caught > 0) {
      // Caught: a little star burst.
      const spread = (1 - this.caught / CAUGHT) * 6 + 2;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + time * 3;
        box(ctx, px + 3 + Math.cos(a) * spread, py + 5 + Math.sin(a) * spread, 2, 2, i % 2 ? '#f3c969' : '#ffffff');
      }
      return;
    }
    box(ctx, px + 1, py, 4, 4, '#f2c79e');
    box(ctx, px + 1, py, 4, 1, '#6b4a33');
    box(ctx, px, py + 4, 6, 4, '#e7793a');
    box(ctx, px + 1, py + 8, 1, 2, '#2a2033');
    box(ctx, px + 4, py + 8, 1, 2, '#2a2033');
  }
}

/** A car or bus in its lane, facing the way it's going: body, windows, wheels. */
function vehicle(ctx: CanvasRenderingContext2D, v: Vehicle, top: number, right: boolean): void {
  const [x, y, h] = [v.x, top + 2, ROW - 4];
  box(ctx, x, y + 1, v.length, h - 2, '#1b1422');
  box(ctx, x + 1, y + 1, v.length - 2, h - 3, v.colour);
  if (v.bus) for (let wx = x + 4; wx < x + v.length - 4; wx += 6) box(ctx, wx, y + 3, 4, 3, '#cfe8f5');
  else box(ctx, right ? x + v.length - 6 : x + 2, y + 3, 4, h - 7, '#cfe8f5');
  // Headlights at the front.
  box(ctx, right ? x + v.length - 1 : x, y + 2, 1, 2, '#fff3b0');
  box(ctx, x + 2, y + h - 2, 3, 2, '#1b1422');
  box(ctx, x + v.length - 5, y + h - 2, 3, 2, '#1b1422');
}

export const CROSS_THE_ROAD: ArcadeGame = {
  id: 'crossTheRoad',
  name: 'Cross the Road',
  icon: '🚸',
  how: 'Hop across the roads, and mind the traffic!',
  start: (random) => new CrossTheRoad(random),
};
