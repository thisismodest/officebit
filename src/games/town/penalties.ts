// Penalties (docs/GAMES.md#penalties): from the football on a pitch, a shoot-out at its nearest goal. Five each: you take
// a penalty (tap to stop the aim sweeping across the goal, tap again for the power), then you're in goal (dive with the
// stick, or tap above or below the keeper, before the shot). Most goals wins. The players are the game's own, drawn
// over the real pitch: the town never knows.
import type { Item } from '../../sim/sim.ts';
import { characterSprite, type Facing, type Look } from '../../render/characters.ts';
import { TILE, type Ctx } from '../../render/pixels.ts';
import { paintBall } from '../../render/props/games.ts';
import { DELTA, type Input } from '../controls.ts';
import { goalNear, type Goal } from './pitches.ts';
import { standAt, type Bar, type TownGameDef, type TownRound } from './runner.ts';

/** Penalties each, and how far from the goal the spot is (tiles). */
const KICKS = 5;
const SPOT = 4;
/** How long (s): the aim takes to sweep across and back, the power meter to fill and empty, the run-up you've to dive
 * in, the ball's flight, and a goal or a save shows. */
const AIM = 1.4;
const POWER = 1;
const RUN_UP = 1.3;
const FLIGHT = 0.5;
const SHOWN = 1.5;
/** Across the goal (tiles from its middle): how far the aim sweeps (past the posts is wide), and the posts. How much of
 * the goal a keeper covers standing, and where a dive takes them. Power above this is over the bar; below this, saveable
 * anywhere near the keeper. */
const SWEEP = 1.25;
const POST = 1;
const KEEPER = 0.45;
const DIVE = 0.7;
const OVER = 0.92;
const SOFT = 0.45;
/** How often the town's keeper guesses your side right, and how often its shots go wide. */
const GUESS = 0.35;
const WIDE = 0.1;

export type Turn = 'shoot' | 'save';
type Stage = 'aim' | 'power' | 'run' | 'flight' | 'shown';
/** How a kick went, decided as it's struck (so the ball flies there): in, saved, wide of the post, or over the bar. */
export type Outcome = 'goal' | 'saved' | 'wide' | 'over';
const SAID: Record<Outcome, string> = { goal: 'Goal!', saved: 'Saved!', wide: 'Wide!', over: 'Over the bar!' };

/** One kick: who took it (0: you, 1: the town), and how it went. */
interface Kick {
  by: 0 | 1;
  scored: boolean;
}

export class Penalties {
  /** Whether you're shooting or in goal. */
  turn: Turn = 'shoot';
  stage: Stage = 'aim';
  t = 0;
  /** The aim across the goal (tiles from its middle) and the power (0–1) as they sweep, and as they're set. */
  aim = 0;
  power = 0;
  /** Where the keeper dives (-1, 0, 1 across the goal) and has got to (0–1 of the way). */
  dive = 0;
  diving = 0;
  kicks: Kick[] = [];
  /** How the one in the air (or just gone) went. */
  outcome: Outcome = 'goal';
  private readonly random: () => number;

  constructor(random: () => number) {
    this.random = random;
  }

  get done(): boolean {
    return this.kicks.length >= KICKS * 2 && this.stage === 'aim';
  }

  /** What the last one was ("Goal!", "Saved!", "Wide!", "Over the bar!"). */
  get said(): string {
    return SAID[this.outcome];
  }

  /** Goals each side has scored. */
  get score(): [number, number] {
    return [0, 1].map((by) => this.kicks.filter((k) => k.by === by && k.scored).length) as [number, number];
  }

  get stars(): number {
    const [a, b] = this.score;
    return a > b ? 3 : a === b ? 2 : 1;
  }

  /** On by `dt` seconds: `act` a tap (or the go button), `way` a dive (-1 one way across the goal, 1 the other) if chosen. */
  step(dt: number, act: boolean, way: number | null): void {
    if (this.done) return;
    this.t += dt;
    if (this.turn === 'save') this.keep(act, way);
    else this.shoot(act);
    if (this.stage === 'flight') {
      this.diving = Math.min(1, this.t / (FLIGHT * 0.8));
      if (this.t >= FLIGHT) {
        // Who took it: you, shooting; the town, with you in goal.
        this.kicks.push({ by: this.turn === 'shoot' ? 0 : 1, scored: this.outcome === 'goal' });
        this.to('shown');
      }
    } else if (this.stage === 'shown' && this.t >= SHOWN) this.next();
  }

  /** Taking it: stop the aim, then the power; the keeper guesses. */
  private shoot(act: boolean): void {
    if (this.stage === 'aim') {
      this.aim = SWEEP * (swing(this.t / AIM) * 2 - 1);
      if (act) this.to('power');
    } else if (this.stage === 'power') {
      this.power = swing(this.t / POWER);
      if (act) {
        const side = Math.sign(this.aim) || (this.random() < 0.5 ? -1 : 1);
        this.dive = this.random() < GUESS ? side : [-1, 0, 1][Math.floor(this.random() * 3)]!;
        this.strike();
      }
    }
  }

  /** In goal: the town runs up; dive before the shot. */
  private keep(act: boolean, way: number | null): void {
    if (this.stage === 'aim') {
      // Where the town's shot goes, decided now; a few go wide.
      this.aim = this.random() < WIDE ? (this.random() < 0.5 ? -1 : 1) * (POST + 0.2) : (this.random() * 2 - 1) * 0.95;
      this.power = 0.5 + this.random() * 0.4;
      this.dive = 0;
      this.to('run');
    } else if (this.stage === 'run') {
      if (way !== null) this.dive = way;
      else if (act) this.dive = 0;
      if (this.t >= RUN_UP) this.strike();
    }
  }

  /** Struck: where the ball's going, against where the keeper's diving; and off it goes. */
  private strike(): void {
    const reach = this.dive * DIVE;
    if (this.power > OVER) this.outcome = 'over';
    else if (Math.abs(this.aim) > POST) this.outcome = 'wide';
    else if (Math.abs(this.aim - reach) <= KEEPER + (this.power < SOFT ? 0.3 : 0)) this.outcome = 'saved';
    else this.outcome = 'goal';
    this.to('flight');
  }

  /** The next kick: you shoot, then you keep. */
  private next(): void {
    this.turn = this.turn === 'shoot' ? 'save' : 'shoot';
    this.dive = 0;
    this.diving = 0;
    this.to('aim');
  }

  private to(stage: Stage): void {
    this.stage = stage;
    this.t = 0;
  }
}

/** You (in the town's colours), and the town's player (in green). */
const YOU: Look = { skin: 1, hair: 2, shirt: 3, style: 0, pants: 1 };
const TOWN: Look = { skin: 2, hair: 3, shirt: 4, style: 0, pants: 0 };
/** Where the ball ends up (tiles): in the net behind the line; off the keeper, back out; wide or over, past the goal and out the back. */
const NET = 0.6;
const REBOUND = 1.6;
const BEHIND = 2;
/** How high the ball rises (pixels): a shot, and one over the bar (well over the crossbar as it passes). */
const LOFT = 5;
const SKIED = 20;

/** Penalties, as the runner plays it: taps for each move, the stick (or a tap either side of the keeper) to dive. */
class PenaltiesRound implements TownRound {
  readonly game: Penalties;
  readonly goal: Goal;
  readonly using?: Item;
  private act = false;
  private way: number | null = null;

  /** Played at `goal`, with the football from the pitch (`ball`), taken to the spot. */
  constructor(game: Penalties, goal: Goal, ball?: Item) {
    this.game = game;
    this.goal = goal;
    this.using = ball;
  }

  step(input: Input, dt: number): void {
    // Diving: along the goal's mouth, whichever way the stick's across it.
    const [ax, ay] = this.goal.across;
    for (const key of input.pressed) {
      if (key === 'a') continue;
      const [dx, dy] = DELTA[key];
      if (dx * ax + dy * ay !== 0) this.way = dx * ax + dy * ay;
    }
    this.game.step(dt, this.act || input.pressed.has('a'), this.way);
    this.act = false;
    this.way = null;
  }

  /** A tap: in goal, a dive towards it (or stay, tapping the keeper); otherwise, the next move. */
  tap(x: number, y: number): void {
    const { game, goal } = this;
    if (game.turn === 'save' && game.stage === 'run') {
      const across = (x - goal.x) * goal.across[0] + (y - goal.y) * goal.across[1];
      this.way = Math.abs(across) < 0.4 ? 0 : Math.sign(across);
    } else this.act = true;
  }

  get done(): boolean {
    return this.game.done;
  }

  get stars(): number {
    return this.game.stars;
  }

  bar(): Bar {
    const { game } = this;
    const said = game.stage === 'shown' ? game.said : game.turn === 'save' ? 'In goal: dive!' : game.stage === 'aim' ? 'Tap to aim' : 'Tap for power';
    const [a, b] = game.score;
    const mine = game.kicks.filter((k) => k.by === 0);
    return {
      say: said,
      chips: Array.from({ length: KICKS }, (_, i) => ({ colour: mine[i] ? (mine[i]!.scored ? '#5fb35a' : '#e94f4f') : '#7f8c99', done: !!mine[i], title: `Kick ${i + 1}` })),
      time: `You ${a} – ${b} Town`,
    };
  }

  focus(): { x: number; y: number } {
    const { goal } = this;
    return { x: goal.x + (goal.out[0] * SPOT) / 2, y: goal.y + (goal.out[1] * SPOT) / 2 };
  }

  result(): string {
    const [a, b] = this.game.score;
    return a > b ? `You win the shoot-out, ${a}–${b}!` : a === b ? `A draw, ${a}–${b}. So close!` : `The town wins it, ${b}–${a}. Next time!`;
  }

  /** The keeper on the line and the taker behind the ball, and the ball (drawn with the town, so dark at night). */
  paint(ctx: Ctx, time: number): void {
    const { game, goal } = this;
    const spot = { x: goal.x + goal.out[0] * SPOT, y: goal.y + goal.out[1] * SPOT };
    // The keeper: on the line, then off across it in the dive.
    const reach = game.dive * DIVE * game.diving;
    const keeper = { x: goal.x + goal.out[0] * 0.3 + goal.across[0] * reach, y: goal.y + goal.out[1] * 0.3 + goal.across[1] * reach };
    const facingOut: Facing = goal.out[0] > 0 ? 'right' : goal.out[0] < 0 ? 'left' : goal.out[1] > 0 ? 'down' : 'up';
    const facingIn: Facing = ({ right: 'left', left: 'right', down: 'up', up: 'down' } as const)[facingOut];
    // In goal, you keep and the town shoots; otherwise, you take it and the town keeps.
    const [keeperLook, takerLook] = game.turn === 'save' ? [YOU, TOWN] : [TOWN, YOU];
    const runUp = game.stage === 'run' ? Math.min(1, game.t / RUN_UP) : 1;
    const back = 1.2 - 0.6 * runUp;
    standAt(ctx, characterSprite(keeperLook, facingOut, 'stand', false), keeper.x, keeper.y);
    standAt(ctx, characterSprite(takerLook, facingIn, game.stage === 'run' && Math.floor(time * 8) % 2 ? 'walkA' : 'stand', false), spot.x + goal.out[0] * back, spot.y + goal.out[1] * back);
    const ball = this.ball();
    ctx.fillStyle = 'rgba(20, 14, 30, 0.25)';
    ctx.fillRect(Math.round((ball.x + 0.5) * TILE) - 2, Math.round((ball.y + 0.5) * TILE) + 2, 5, 2);
    paintBall(ctx, (ball.x + 0.5) * TILE, (ball.y + 0.5) * TILE - ball.up);
  }

  /** Where the ball is (tiles), and how high (pixels): on the spot, then on its way to where it was going. A save flies to
   * the keeper's hands and bounces back out; wide and over fly past the goal and on out the back. */
  private ball(): { x: number; y: number; up: number } {
    const { game, goal } = this;
    const at = (across: number, out: number) => ({ x: goal.x + goal.across[0] * across + goal.out[0] * out, y: goal.y + goal.across[1] * across + goal.out[1] * out });
    const spot = at(0, SPOT);
    const k = game.stage === 'flight' ? game.t / FLIGHT : game.stage === 'shown' ? 1 : 0;
    const along = (from: { x: number; y: number }, to: { x: number; y: number }, k: number, up: number) =>
      ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, up: Math.sin(k * Math.PI) * up });
    switch (game.outcome) {
      case 'goal':
        return along(spot, at(game.aim, -NET), k, LOFT);
      case 'saved': {
        // To the keeper's hands (the first part of the flight), then off them back out the way it came.
        const hands = at(game.dive * DIVE, 0.3);
        const HIT = 0.6;
        return k < HIT ? along(spot, hands, k / HIT, LOFT) : along(hands, at(game.dive * DIVE * 1.5, REBOUND), (k - HIT) / (1 - HIT), LOFT);
      }
      case 'wide':
        return along(spot, at(game.aim * 1.5, -BEHIND), k, LOFT);
      case 'over':
        return along(spot, at(game.aim, -BEHIND), k, SKIED);
    }
  }

  /** The aim sweeping across the goal and the power meter (bright, over the town), and what happened. */
  mark(ctx: Ctx, time: number): void {
    const { game, goal } = this;
    if (game.turn === 'shoot' && (game.stage === 'aim' || game.stage === 'power')) {
      const [mx, my] = [(goal.x + goal.across[0] * game.aim + 0.5) * TILE, (goal.y + goal.across[1] * game.aim + 0.5) * TILE];
      ctx.strokeStyle = Math.abs(game.aim) > POST ? '#e94f4f' : '#f3c969';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(mx) - 3.5, Math.round(my) - 3.5, 7, 7);
    }
    if (game.turn === 'shoot' && game.stage === 'power') {
      const spot = { x: (goal.x + goal.out[0] * SPOT + 0.5) * TILE, y: (goal.y + goal.out[1] * SPOT + 0.5) * TILE };
      const [x, y] = [Math.round(spot.x) - 12, Math.round(spot.y) + 10];
      ctx.fillStyle = '#2a2033';
      ctx.fillRect(x - 1, y - 1, 26, 6);
      ctx.fillStyle = '#4a4458';
      ctx.fillRect(x, y, 24, 4);
      ctx.fillStyle = 'rgba(233, 79, 79, 0.6)';
      ctx.fillRect(x + Math.round(OVER * 24), y, 24 - Math.round(OVER * 24), 4);
      ctx.fillStyle = '#5fb35a';
      ctx.fillRect(x, y, Math.round(game.power * 24), 4);
    }
    // In goal, which way you're going: arrows either side of the keeper.
    if (game.turn === 'save' && game.stage === 'run' && Math.floor(time * 4) % 2 === 0) {
      for (const side of [-1, 1]) {
        const [ax, ay] = [(goal.x + goal.across[0] * side * 1.3 + 0.5) * TILE, (goal.y + goal.across[1] * side * 1.3 + 0.5) * TILE];
        ctx.fillStyle = game.dive === side ? '#f3c969' : 'rgba(255, 255, 255, 0.6)';
        ctx.fillRect(Math.round(ax) - 2, Math.round(ay) - 2, 4, 4);
      }
    }
  }
}

/** 0 up to 1 and back, over each whole number. */
function swing(t: number): number {
  const k = t % 1;
  return k < 0.5 ? k * 2 : 2 - k * 2;
}

export const PENALTIES: TownGameDef = {
  title: '⚽ Penalties',
  pad: true,
  zoom: 3,
  plan: (sim, from, random) => {
    const level = sim.traffic.level;
    const items = level ? sim.itemsOn(level) : [];
    const goal = goalNear(items.map((i) => i.def), from);
    const ball = items.find((i) => i.def.t === 'football' && i.def.p[0] === from[0] && i.def.p[1] === from[1]);
    return goal ? new PenaltiesRound(new Penalties(random), goal, ball) : null;
  },
};
