// Catch! (docs/GAMES.md#catch): out on the grass by the ball tub, a friend throws balls your way; run to where each will
// land (its shadow shows where) and be there when it does. Ten throws, a little quicker each time. The thrower and the
// catcher are the game's own, drawn over the map: the town's story never knows.
import type { Simulation } from '../../sim/sim.ts';
import type { Tile } from '../../sim/world.ts';
import { characterSprite, type Facing, type Look } from '../../render/characters.ts';
import { TILE, type Ctx } from '../../render/pixels.ts';
import { DELTA, type Input } from '../controls.ts';
import { standAt, type Bar, type TownGameDef, type TownRound } from './runner.ts';

/** Throws a round; how fast you run (tiles a second); how near the ball must land to be caught (tiles). */
const THROWS = 10;
const RUN = 4.5;
const REACH = 1.1;
/** How long a ball's in the air (s): the first, the quickest it gets, and how much quicker each throw. */
const FLIGHT = { first: 2, quickest: 1.4, quicker: 0.07 };
/** The pause between one ball landing and the next being thrown (s), and how high a ball goes (px). */
const BETWEEN = 0.9;
const HEIGHT = 30;
/** The field: grass this far round where you start (tiles); balls land at least this far from the thrower. */
const FIELD = 5;
const NEAR_THROWER = 3;
/** A ball lands where you could get to comfortably: after a moment to see where it's going (s), running for this share of
 * the rest of its time in the air (round a pond, say, takes longer than straight). */
const REACTION = 0.4;
const REACHABLE = 0.6;
/** Catches for three stars, and for two. */
const STARS: [three: number, two: number] = [8, 5];
/** Seconds a catch or a miss shows. */
const SHOWN = 0.8;

/** You, and a friend throwing: a sports top each. */
const YOU: Look = { skin: 1, hair: 2, shirt: 3, style: 0, pants: 1 };
const THROWER: Look = { skin: 3, hair: 0, shirt: 5, style: 1, pants: 2 };
const BALL = '#e94f4f';

export interface Ball {
  from: { x: number; y: number };
  to: Tile;
  /** Seconds in the air so far, and how long it'll be up. */
  t: number;
  flight: number;
}

export class Catch {
  x: number;
  y: number;
  facing: Facing = 'down';
  /** Seconds since the start. */
  time = 0;
  thrower: Tile;
  ball: Ball | null = null;
  thrown = 0;
  caught = 0;
  /** The last ball, just landed: caught or not, where, and for how much longer it shows. */
  landed: { caught: boolean; at: Tile; left: number } | null = null;
  /** Seconds till the next throw. */
  wait = BETWEEN;
  /** Running towards a spot tapped on the map; and whether you moved this step. */
  target: { x: number; y: number } | null = null;
  moving = false;
  private readonly field: Tile[];
  private readonly walkable: (x: number, y: number) => boolean;
  private readonly random: () => number;

  constructor(start: Tile, thrower: Tile, field: Tile[], walkable: (x: number, y: number) => boolean, random: () => number) {
    [this.x, this.y] = start;
    this.thrower = thrower;
    this.field = field;
    this.walkable = walkable;
    this.random = random;
  }

  get done(): boolean {
    return this.thrown >= THROWS && !this.ball;
  }

  get stars(): number {
    return this.caught >= STARS[0] ? 3 : this.caught >= STARS[1] ? 2 : 1;
  }

  step(input: Input, dt: number): void {
    if (this.landed) this.landed.left -= dt;
    if (this.landed && this.landed.left <= 0) this.landed = null;
    if (this.done) return;
    this.time += dt;
    this.run(input, dt);
    if (this.ball) {
      this.ball.t += dt;
      if (this.ball.t >= this.ball.flight) this.land(this.ball);
    } else if (this.thrown < THROWS) {
      this.wait -= dt;
      if (this.wait <= 0) this.throw();
    }
  }

  /** Where you're pressing (or towards where you tapped), over anything you can walk on. */
  private run(input: Input, dt: number): void {
    this.moving = false;
    let [dx, dy] = [0, 0];
    for (const way of input.held) [dx, dy] = [dx + DELTA[way][0], dy + DELTA[way][1]];
    if (dx || dy) this.target = null;
    else if (this.target) {
      [dx, dy] = [this.target.x - this.x, this.target.y - this.y];
      if (Math.hypot(dx, dy) < 0.1) this.target = null;
    }
    const length = Math.hypot(dx, dy);
    if (!length) return;
    const step = Math.min(RUN * dt, this.target ? length : Infinity);
    const [nx, ny] = [this.x + (dx / length) * step, this.y + (dy / length) * step];
    // Each way on its own, so you slide along a pond's edge rather than stick to it.
    const [wasX, wasY] = [this.x, this.y];
    if (this.walkable(Math.round(nx), Math.round(this.y))) this.x = nx;
    if (this.walkable(Math.round(this.x), Math.round(ny))) this.y = ny;
    this.moving = this.x !== wasX || this.y !== wasY;
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  /** Run to there (tiles). */
  runTo(x: number, y: number): void {
    this.target = { x, y };
  }

  private throw(): void {
    const flight = Math.max(FLIGHT.quickest, FLIGHT.first - this.thrown * FLIGHT.quicker);
    // Somewhere on the field a good way from the thrower, that you can get to in time from where you are.
    const reach = RUN * (flight - REACTION) * REACHABLE;
    const spots = this.field.filter(([x, y]) => Math.hypot(x - this.thrower[0], y - this.thrower[1]) >= NEAR_THROWER && Math.hypot(x - this.x, y - this.y) <= reach);
    const nearest = [...this.field].sort((a, b) => Math.hypot(a[0] - this.x, a[1] - this.y) - Math.hypot(b[0] - this.x, b[1] - this.y))[0]!;
    const to = spots[Math.floor(this.random() * spots.length)] ?? nearest;
    this.ball = { from: { x: this.thrower[0], y: this.thrower[1] }, to, t: 0, flight };
    this.thrown++;
  }

  private land(ball: Ball): void {
    const caught = Math.hypot(this.x - ball.to[0], this.y - ball.to[1]) <= REACH;
    if (caught) this.caught++;
    this.landed = { caught, at: ball.to, left: SHOWN };
    this.ball = null;
    this.wait = BETWEEN;
  }
}

/** A round from the ball tub: you on the grass beside it, a friend a few steps off, and the grass round about to throw to. Null if there's no grass to play on. */
export function plan(sim: Simulation, from: Tile, random: () => number): Catch | null {
  const town = sim.traffic.level;
  const grid = town ? sim.grids.get(town) : undefined;
  const level = town ? sim.levels.get(town) : undefined;
  if (!grid || !level) return null;
  const grass = (x: number, y: number) => grid.inBounds(x, y) && grid.walkable(x, y) && level.rooms[grid.roomAt(x, y)]?.floor === 'grass';
  const start = nearestTo(from, grass);
  if (!start) return null;
  const field: Tile[] = [];
  for (let y = start[1] - FIELD; y <= start[1] + FIELD; y++)
    for (let x = start[0] - FIELD; x <= start[0] + FIELD; x++) if (Math.hypot(x - start[0], y - start[1]) <= FIELD && grass(x, y)) field.push([x, y]);
  // The thrower: on the field, as far from you as it goes.
  const thrower = field.reduce((a, b) => (Math.hypot(b[0] - start[0], b[1] - start[1]) > Math.hypot(a[0] - start[0], a[1] - start[1]) ? b : a), start);
  if (field.length < 12 || thrower === start) return null;
  // Anywhere walkable near the field, so you can chase a ball to its edge.
  const walkable = (x: number, y: number) => grid.inBounds(x, y) && grid.walkable(x, y) && Math.hypot(x - start[0], y - start[1]) <= FIELD + 2;
  return new Catch(start, thrower, field, walkable, random);
}

/** Catch!, as the runner plays it: the joystick or a tap to run, and the camera on you. */
class CatchRound implements TownRound {
  readonly game: Catch;

  constructor(game: Catch) {
    this.game = game;
  }

  step(input: Input, dt: number): void {
    this.game.step(input, dt);
  }

  tap(x: number, y: number): void {
    this.game.runTo(x, y);
  }

  get done(): boolean {
    return this.game.done;
  }

  get stars(): number {
    return this.game.stars;
  }

  bar(): Bar {
    const { game } = this;
    const landed = game.landed;
    return {
      say: landed ? (landed.caught ? 'Caught it!' : 'Missed!') : `Caught ${game.caught}`,
      chips: [],
      time: `${THROWS - game.thrown} to go`,
      way: game.ball ? { from: game, to: { x: game.ball.to[0], y: game.ball.to[1] }, colour: BALL } : null,
    };
  }

  focus(): { x: number; y: number } {
    return this.game;
  }

  result(): string {
    return `You caught ${this.game.caught} of ${THROWS}!`;
  }

  /** The thrower, you and the ball, out on the grass (night darkens them, as it does everyone). */
  paint(ctx: Ctx, time: number): void {
    const { game } = this;
    const ball = game.ball;
    // Where it'll land: a shadow, darker and smaller the nearer it is to coming down.
    if (ball) {
      const k = ball.t / ball.flight;
      const r = Math.round(6 - k * 3);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + k * 0.3})`;
      ctx.fillRect(px(ball.to[0]) - r, px(ball.to[1]) + 4 - Math.ceil(r / 2), r * 2, r);
    }
    // The thrower (facing you, but for just after a throw), and you, running when you're moving.
    standAt(ctx, characterSprite(THROWER, game.ball && game.ball.t < 0.3 ? 'down' : game.x < game.thrower[0] ? 'left' : 'right', 'stand', false), game.thrower[0], game.thrower[1]);
    const pose = game.moving ? (Math.floor(time * 8) % 2 ? 'walkA' : 'walkB') : 'stand';
    standAt(ctx, characterSprite(YOU, game.facing, pose, false), game.x, game.y);
    // The ball, up in its arc.
    if (ball) {
      const k = ball.t / ball.flight;
      const x = ball.from.x + (ball.to[0] - ball.from.x) * k;
      const y = ball.from.y + (ball.to[1] - ball.from.y) * k;
      const up = 4 * HEIGHT * k * (1 - k) + 8 * (1 - k);
      ctx.fillStyle = '#2a2033';
      ctx.fillRect(px(x) - 2, px(y) - Math.round(up) - 2, 5, 5);
      ctx.fillStyle = BALL;
      ctx.fillRect(px(x) - 1, px(y) - Math.round(up) - 1, 3, 3);
    }
    // Just landed: in your hands, or a bounce on the grass.
    if (game.landed) {
      const [bx, by] = landedAt(game);
      ctx.fillStyle = BALL;
      ctx.fillRect(bx - 1, by - 1, 3, 3);
    }
  }

  /** Bright after dark too: a square where the ball will land, and a sparkle round a catch. */
  mark(ctx: Ctx): void {
    const { game } = this;
    if (game.ball) {
      ctx.strokeStyle = BALL;
      ctx.lineWidth = 1;
      ctx.strokeRect(px(game.ball.to[0]) - 7.5, px(game.ball.to[1]) - 3.5, 15, 15);
    }
    if (game.landed?.caught) {
      const [bx, by] = landedAt(game);
      const spread = (1 - game.landed.left / SHOWN) * 10 + 4;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? '#f3c969' : '#ffffff';
        ctx.fillRect(Math.round(bx + Math.cos(a) * spread) - 1, Math.round(by + Math.sin(a) * spread) - 1, 2, 2);
      }
    }
  }
}

/** The middle of a tile, in world pixels. */
const px = (t: number) => Math.round((t + 0.5) * TILE);

/** Where the ball that's just landed is (world pixels): held up in your hands, or bouncing where it came down. */
function landedAt(game: Catch): [number, number] {
  const { at, caught, left } = game.landed!;
  const lift = caught ? 14 : Math.abs(Math.sin((1 - left / SHOWN) * Math.PI * 2)) * 6;
  return caught ? [px(game.x), px(game.y) - lift] : [px(at[0]), px(at[1]) - lift];
}

/** The tile nearest a spot that suits, looking a little way round it. */
function nearestTo([fx, fy]: Tile, suits: (x: number, y: number) => boolean): Tile | null {
  for (let r = 0; r <= 6; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r && suits(fx + dx, fy + dy)) return [fx + dx, fy + dy];
  return null;
}

export const CATCH: TownGameDef = {
  title: '⚾ Catch!',
  pad: true,
  // Close enough to see the ball's shadow and get to it.
  zoom: 3,
  plan: (sim, from, random) => {
    const game = plan(sim, from, random);
    return game && new CatchRound(game);
  },
};
