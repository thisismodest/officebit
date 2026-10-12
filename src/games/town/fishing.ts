// Fishing (docs/GAMES.md#fishing): from a fishing barrel by any water (a pond, the river), five casts. Tap to stop the
// swinging power meter and cast; wait for the float to dip, tap quick to hook it; then tap and tap to reel it in, as it
// pulls back (the big ones harder): let the meter empty and it's away. What's biting depends on the water (pond or river), the time of day and how far out you
// cast; every fish goes back. The angler's the game's own: the town never knows.
import type { Simulation } from '../../sim/sim.ts';
import type { Tile } from '../../sim/world.ts';
import { FARTHEST, swimNear, type Water } from './pitches.ts';
import { anchors, characterSprite, type Facing, type Look } from '../../render/characters.ts';
import { TILE, type Ctx } from '../../render/pixels.ts';
import type { Input } from '../controls.ts';
import { CHIP, standAt, type Bar, type TownGameDef, type TownRound } from './runner.ts';

/** Casts a round. */
const CASTS = 5;
/** How long (s): the power meter takes to swing up and back, the float flies, the wait for a bite (shortest, longest),
 * the bite lasts before it's gone, and a catch or a miss shows. */
const SWING = 1.6;
const FLIGHT = 0.6;
const WAIT: [number, number] = [2, 7];
const BITE = 1.2;
const SHOWN = 1.8;
/** Reeling (shares of the way in): how far in it starts, hooked; each tap brings it in this much; it pulls back this
 * much a second, and this much more a second for each kg, up to the most. Pulled right back, it's off. */
const REEL = { start: 0.3, tap: 0.065, pull: 0.13, perKg: 0.025, most: 0.25 };
/** Fish bite sooner at dawn and dusk (and in the rain), by this much. */
const KEEN = 0.6;

/** A kind of fish: where it's found, how heavy (kg, least to most), how often (a weight), and when or how far out. */
interface Species {
  name: string;
  water: Water;
  kg: [number, number];
  odds: number;
  colour: string;
  /** Only after dark (eels), or only far out (pike). */
  night?: boolean;
  far?: boolean;
}

export const FISH: readonly Species[] = [
  { name: 'Roach', water: 'pond', kg: [0.1, 0.6], odds: 4, colour: '#b9c4cf' },
  { name: 'Rudd', water: 'pond', kg: [0.1, 0.8], odds: 3, colour: '#d6a24a' },
  { name: 'Tench', water: 'pond', kg: [0.5, 2.5], odds: 2, colour: '#5f7d3a' },
  { name: 'Carp', water: 'pond', kg: [1, 8], odds: 1.5, colour: '#b98a3e', far: true },
  { name: 'Goldfish', water: 'pond', kg: [0.05, 0.3], odds: 0.5, colour: '#f08a24' },
  { name: 'Perch', water: 'river', kg: [0.1, 1.2], odds: 4, colour: '#7d9a4a' },
  { name: 'Chub', water: 'river', kg: [0.3, 2.5], odds: 3, colour: '#a7a28c' },
  { name: 'Trout', water: 'river', kg: [0.3, 3], odds: 2.5, colour: '#8fa6b8' },
  { name: 'Pike', water: 'river', kg: [1, 10], odds: 1, colour: '#6e8a4e', far: true },
  { name: 'Eel', water: 'river', kg: [0.2, 2], odds: 1.5, colour: '#4a4a3a', night: true },
];

export type Stage = 'aim' | 'flying' | 'waiting' | 'bite' | 'reeling' | 'shown';

/** A fish on the line (and, once landed, caught). */
export interface Catch {
  species: Species;
  kg: number;
}

export class Fishing {
  stage: Stage = 'aim';
  /** Seconds into this stage. */
  t = 0;
  /** The power meter (0–1) as it swings, and the cast's. */
  power = 0;
  /** Where the float is (tiles), and how far out it went (0–1). */
  float: { x: number; y: number } | null = null;
  reach = 0;
  /** Casts left, fish landed, and the last one shown (landed, or what got away). */
  casts = CASTS;
  landed: Catch[] = [];
  /** Each cast as it went: the fish landed, or null for one that got away. */
  tries: (Catch | null)[] = [];
  last: { fish: Catch | null; said: string } | null = null;
  /** Reeling: how far in (0–1). */
  progress = 0;
  private waitFor = 0;
  private hooked: Catch | null = null;
  readonly at: Tile;
  readonly facing: Facing;
  private readonly water: readonly Tile[];
  private readonly kind: Water;
  private readonly keen: () => boolean;
  private readonly night: () => boolean;
  private readonly random: () => number;

  /** Standing `at`, facing the water (its tiles, pond or river); whether fish are keen just now, and whether it's dark. */
  constructor(at: Tile, water: readonly Tile[], kind: Water, keen: () => boolean, night: () => boolean, random: () => number) {
    this.at = at;
    this.water = water;
    this.kind = kind;
    this.keen = keen;
    this.night = night;
    this.random = random;
    const [mx, my] = middle(water);
    const [dx, dy] = [mx - at[0], my - at[1]];
    this.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  }

  get done(): boolean {
    return this.casts === 0 && this.stage === 'aim';
  }

  get stars(): number {
    return this.landed.length >= 4 ? 3 : this.landed.length >= 2 ? 2 : 1;
  }

  /** On by `dt` seconds; `act` is a tap (or the go button) this step. */
  step(dt: number, act: boolean): void {
    if (this.done) return;
    this.t += dt;
    switch (this.stage) {
      case 'aim':
        this.power = swing(this.t / SWING);
        if (act) this.cast();
        break;
      case 'flying':
        if (this.t >= FLIGHT) this.to('waiting');
        break;
      case 'waiting':
        if (this.t >= this.waitFor) this.to('bite');
        break;
      case 'bite':
        if (act) {
          this.hooked = this.pick();
          this.progress = REEL.start;
          this.to('reeling');
        } else if (this.t >= BITE) this.show(null, 'Too slow! It got away.');
        break;
      case 'reeling':
        this.reel(dt, act);
        break;
      case 'shown':
        if (this.t >= SHOWN) {
          this.float = null;
          this.to('aim');
        }
        break;
    }
  }

  private cast(): void {
    this.casts--;
    this.reach = Math.max(0.15, this.power);
    // Out over the water as far as the cast goes: the water tile nearest that far from you.
    const [mx, my] = middle(this.water);
    const length = Math.hypot(mx - this.at[0], my - this.at[1]) || 1;
    const aim = [this.at[0] + ((mx - this.at[0]) / length) * this.reach * FARTHEST, this.at[1] + ((my - this.at[1]) / length) * this.reach * FARTHEST];
    const [fx, fy] = this.water.reduce((a, b) => (Math.hypot(b[0] - aim[0]!, b[1] - aim[1]!) < Math.hypot(a[0] - aim[0]!, a[1] - aim[1]!) ? b : a));
    this.float = { x: fx, y: fy };
    this.waitFor = (WAIT[0] + this.random() * (WAIT[1] - WAIT[0])) * (this.keen() ? KEEN : 1);
    this.to('flying');
  }

  /** In a tap at a time, the fish pulling back between: all the way in and it's yours, all the way back and it's off. */
  private reel(dt: number, act: boolean): void {
    const pull = Math.min(REEL.most, REEL.pull + REEL.perKg * (this.hooked?.kg ?? 0));
    this.progress = Math.max(0, this.progress - pull * dt + (act ? REEL.tap : 0));
    if (this.progress <= 0) this.show(null, 'It pulled free and got away!');
    else if (this.progress >= 1 && this.hooked) {
      this.landed.push(this.hooked);
      this.show(this.hooked, `A ${this.hooked.kg.toFixed(1)} kg ${this.hooked.species.name.toLowerCase()}!`);
    }
  }

  /** What's bitten: the kinds in this water, at this time of day, out this far, by how common they are. */
  private pick(): Catch {
    const night = this.night();
    const could = FISH.filter((f) => f.water === this.kind && (!f.night || night) && (!f.far || this.reach > 0.6));
    // One of them, the commoner ones likelier.
    let roll = this.random() * could.reduce((sum, f) => sum + f.odds, 0);
    let species = could[0]!;
    for (const f of could) {
      species = f;
      roll -= f.odds;
      if (roll < 0) break;
    }
    // Further out, bigger fish.
    const kg = species.kg[0] + (species.kg[1] - species.kg[0]) * this.random() ** (1.6 - this.reach);
    return { species, kg: Math.round(kg * 10) / 10 };
  }

  private show(fish: Catch | null, said: string): void {
    this.last = { fish, said };
    this.tries.push(fish);
    this.hooked = null;
    this.to('shown');
  }

  private to(stage: Stage): void {
    this.stage = stage;
    this.t = 0;
  }
}

/** Water near the barrel (a pond, or the river and its shallows), and somewhere beside it to stand. Null with no water near. */
export function plan(sim: Simulation, from: Tile, random: () => number): Fishing | null {
  const town = sim.traffic.level;
  const grid = town ? sim.grids.get(town) : undefined;
  const level = town ? sim.levels.get(town) : undefined;
  const swim = town && grid && level ? swimNear(level, grid, sim.itemsOn(town).map((i) => i.def), from) : null;
  if (!swim) return null;
  const keen = () => {
    const light = sim.daylight();
    return (light > 0.15 && light < 0.85) || sim.weather.wet() > 0;
  };
  return new Fishing(swim.stand, swim.water, swim.kind, keen, () => sim.daylight() < 0.3, random);
}

/** You, fishing: a hat and a waterproof. */
const ANGLER: Look = { skin: 2, hair: 1, shirt: 6, style: 0, pants: 2 };

/** Fishing, as the runner plays it: the camera on you, and a tap anywhere (or the go button) for each move. */
class FishingRound implements TownRound {
  readonly game: Fishing;
  private act = false;

  constructor(game: Fishing) {
    this.game = game;
  }

  step(input: Input, dt: number): void {
    this.game.step(dt, this.act || input.pressed.has('a'));
    this.act = false;
  }

  tap(): void {
    this.act = true;
  }

  get done(): boolean {
    return this.game.done;
  }

  get stars(): number {
    return this.game.stars;
  }

  bar(): Bar {
    const { game } = this;
    const said: Record<Stage, string> = {
      aim: 'Tap to cast',
      flying: 'Cast!',
      waiting: 'Wait for a bite…',
      bite: 'Bite! Tap!',
      reeling: 'Tap tap tap to reel it in!',
      shown: game.last?.said ?? '',
    };
    return {
      say: said[game.stage],
      // Each cast: one landed, one that got away, or still to come.
      chips: Array.from({ length: CASTS }, (_, i) => {
        const tried = i < game.tries.length;
        const fish = game.tries[i];
        return { colour: !tried ? CHIP.todo : fish ? CHIP.won : CHIP.lost, title: !tried ? `Cast ${i + 1}` : (fish?.species.name ?? 'Got away') };
      }),
    };
  }

  focus(): { x: number; y: number } {
    const { at, float } = this.game;
    return float ? { x: (at[0] + float.x) / 2, y: (at[1] + float.y) / 2 } : { x: at[0], y: at[1] };
  }

  result(): string {
    const { landed } = this.game;
    if (!landed.length) return 'Nothing today. They’ll be biting next time!';
    const best = landed.reduce((a, b) => (b.kg > a.kg ? b : a));
    return `You caught ${landed.length} fish, the biggest a ${best.kg.toFixed(1)} kg ${best.species.name.toLowerCase()}.`;
  }

  /** You on the bank, the rod out over the water, and the line to the float (drawn with the town, so dark at night). */
  paint(ctx: Ctx, time: number): void {
    const { game } = this;
    const [x, y] = game.at;
    const sprite = characterSprite(ANGLER, game.facing, 'stand', false);
    standAt(ctx, sprite, x, y);
    const rows = anchors(ANGLER, 'stand');
    const hands = { x: Math.round(x * TILE) + 6, y: Math.round(y * TILE) + 14 - sprite.height + 1 + rows.hands };
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[game.facing];
    // The rod: up and out, bending when there's a fish on.
    const bend = game.stage === 'reeling' ? 3 + Math.round(Math.sin(time * 12) * 1.5) : 0;
    const tip = { x: hands.x + dx! * 12, y: hands.y - 10 + (dy! > 0 ? 4 : 0) + bend };
    line(ctx, hands.x, hands.y, tip.x, tip.y, '#6b4a33');
    if (!game.float) return;
    // The line: out to the float, flying out to it as it's cast.
    const k = game.stage === 'flying' ? game.t / FLIGHT : 1;
    const fx = tip.x + ((game.float.x + 0.5) * TILE - tip.x) * k;
    const fy = tip.y + ((game.float.y + 0.5) * TILE - tip.y) * k - Math.sin(k * Math.PI) * 10;
    line(ctx, tip.x, tip.y, fx, fy, 'rgba(240, 240, 240, 0.7)');
  }

  /** The float (bright, to see after dark), ripples round it, and the meters over you. */
  mark(ctx: Ctx, time: number): void {
    const { game } = this;
    const [x, y] = game.at;
    const above = { x: Math.round((x + 0.5) * TILE), y: Math.round(y * TILE) - 16 };
    if (game.stage === 'aim') meter(ctx, above.x - 12, above.y, game.power, '#f3c969');
    if (game.stage === 'reeling') meter(ctx, above.x - 12, above.y, Math.min(1, game.progress), '#5fb35a');
    // One landed: a star bursting up over you.
    if (game.stage === 'shown' && game.last?.fish) paintStar(ctx, above.x, above.y + 4 - Math.min(6, game.t * 24), time);
    const float = game.float;
    if (!float || game.stage === 'flying' || (game.stage === 'shown' && !game.last?.fish)) return;
    const [cx, cy] = [Math.round((float.x + 0.5) * TILE), Math.round((float.y + 0.5) * TILE)];
    // Bobbing; under, with a splash, when it's biting.
    const dip = game.stage === 'bite' ? 2 : Math.round(Math.sin(time * 3));
    const ring = (time * 6) % 8;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - ring, cy + 2 - ring / 3, ring * 2, (ring * 2) / 3);
    ctx.fillStyle = '#2a2033';
    ctx.fillRect(cx - 2, cy - 4 + dip, 4, 6);
    ctx.fillStyle = '#e94f4f';
    ctx.fillRect(cx - 1, cy - 3 + dip, 2, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 1, cy - 1 + dip, 2, 2);
    if (game.stage === 'bite') {
      ctx.fillStyle = '#f3c969';
      ctx.fillRect(cx - 1, cy - 14, 2, 6);
      ctx.fillRect(cx - 1, cy - 6, 2, 2);
    }
  }
}

/** A meter over you: how full (0–1), in a colour. */
function meter(ctx: Ctx, x: number, y: number, full: number, colour: string): void {
  ctx.fillStyle = '#2a2033';
  ctx.fillRect(x - 1, y - 1, 26, 6);
  ctx.fillStyle = '#4a4458';
  ctx.fillRect(x, y, 24, 4);
  ctx.fillStyle = colour;
  ctx.fillRect(x, y, Math.round(full * 24), 4);
}

/** A gold star, centred on (cx, cy), twinkling at its points. */
const STAR = ['....o....', '...oyo...', 'oooyyyooo', 'oyyyyyyyo', '.oyyyyyo.', '..oyyyo..', '.oyyoyyo.', '.oyo.oyo.', '.oo...oo.'];
const STAR_INK: Record<string, string> = { o: '#2a2033', y: '#f3c969' };
function paintStar(ctx: Ctx, cx: number, cy: number, time: number): void {
  const [x0, y0] = [Math.round(cx) - 4, Math.round(cy) - 4];
  STAR.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ink = STAR_INK[row[x]!];
      if (ink) {
        ctx.fillStyle = ink;
        ctx.fillRect(x0 + x, y0 + y, 1, 1);
      }
    }
  });
  ctx.fillStyle = '#fff6d6';
  ctx.fillRect(x0 + 4, y0 + 3, 1, 2);
  // Sparkles, taking turns round it.
  ctx.fillStyle = '#ffffff';
  const twinkle = Math.floor(time * 6) % 4;
  for (const [i, dx, dy] of [[0, -4, -4], [1, 6, -2], [2, 7, 6], [3, -5, 5]] as const) if (i === twinkle) ctx.fillRect(x0 + 4 + dx, y0 + 4 + dy, 1, 1);
}

function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, colour: string): void {
  ctx.fillStyle = colour;
  const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), 1, 1);
}

/** The middle of some tiles. */
function middle(tiles: readonly Tile[]): Tile {
  const n = Math.max(1, tiles.length);
  return [tiles.reduce((s, t) => s + t[0], 0) / n, tiles.reduce((s, t) => s + t[1], 0) / n];
}

/** 0 up to 1 and back, over each whole number. */
function swing(t: number): number {
  const k = t % 1;
  return k < 0.5 ? k * 2 : 2 - k * 2;
}

export const FISHING: TownGameDef = {
  title: '🎣 Fishing',
  pad: false,
  zoom: 3,
  plan: (sim, from, random) => {
    const game = plan(sim, from, random);
    return game && new FishingRound(game);
  },
};
