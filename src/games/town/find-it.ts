// Find it (docs/GAMES.md#find-it): someone from town is out and about; find them and tap them. Three to find, against the
// clock, looking round the map yourself (drag it, or the arrows). Stuck a while, and a ring and an arrow help. It's
// pretend: whoever's wanted is the real them if they're out, or else a stand-in of them, drawn by the game, waiting
// somewhere outdoors near the noticeboard. It only looks at the town: nobody knows they're wanted.
import type { Simulation } from '../../sim/sim.ts';
import type { Tile } from '../../sim/world.ts';
import { TILE, type Ctx } from '../../render/pixels.ts';
import type { Input } from '../controls.ts';
import { clock, standAt, type Bar, type Portrait, type TownGameDef, type TownRound } from './runner.ts';

/** How many to find; how near a tap must be to count (tiles); and after how long looking for one a ring and an arrow help (s). */
const FINDS = 3;
const NEAR = 1.4;
const HINT_AFTER = 15;
/** A stand-in waits this near the noticeboard (tiles), on ground people stand about on (never a road). */
const RANGE = 30;
const STAND_ON = new Set(['grass', 'path', 'sand']);
/** The ring starts this wide (tiles) and closes in on them over this long (s). */
const RING = { wide: 8, closes: 20 };
/** Average seconds a find for three stars, and for two. */
const STARS: [three: number, two: number] = [15, 35];
/** How long a find sparkles, and a word stays in the bar (s). */
const SPARKLE = 1;
const SAID = 2.5;
const GOLD = '#f3c969';

/** Someone from town who could be wanted. */
export interface Townsperson {
  id: string;
  name: string;
}

/** Someone where they can be seen: out in town (or their stand-in), where they are now. */
export interface Findable extends Townsperson {
  x: number;
  y: number;
}

export class FindIt {
  /** Seconds since the start, and since this one was wanted. */
  time = 0;
  looking = 0;
  /** Who's been found, and who's wanted now: out in town, or (`standIn`) the game's own stand-in of them. */
  readonly found: string[] = [];
  wanted: Findable | null = null;
  standIn = false;
  /** How many to find this round (just the one, if there's just one in town). */
  readonly finds: number;
  /** A word for the bar for a moment ("That's Kit!"), and where the last find sparkles. */
  said: { text: string; left: number } | null = null;
  sparkle: { x: number; y: number; left: number } | null = null;
  private readonly town: readonly Townsperson[];
  /** Somewhere outdoors for a stand-in to wait. */
  private readonly place: () => Tile | null;
  private readonly random: () => number;

  constructor(town: readonly Townsperson[], about: readonly Findable[], place: () => Tile | null, random: () => number) {
    this.town = town;
    this.place = place;
    this.random = random;
    // Anyone can be wanted again, just not twice running: two in town is enough for three finds.
    this.finds = town.length >= 2 ? FINDS : town.length;
    this.next(about);
  }

  get done(): boolean {
    return this.found.length >= this.finds;
  }

  get stars(): number {
    const each = this.time / Math.max(1, this.found.length);
    return each <= STARS[0] ? 3 : each <= STARS[1] ? 2 : 1;
  }

  /** Long enough looking for this one: show where. */
  get hinting(): boolean {
    return this.looking >= HINT_AFTER;
  }

  /** On by `dt` seconds, with who's out and about now. */
  step(dt: number, about: readonly Findable[]): void {
    if (this.said) this.said.left -= dt;
    if (this.said && this.said.left <= 0) this.said = null;
    if (this.sparkle) this.sparkle.left -= dt;
    if (this.sparkle && this.sparkle.left <= 0) this.sparkle = null;
    if (this.done) return;
    this.time += dt;
    this.looking += dt;
    if (!this.wanted) {
      this.next(about);
      return;
    }
    // Out for real: the real them (a stand-in steps aside). Gone in: a stand-in stays where they were.
    const real = about.find((f) => f.id === this.wanted!.id);
    if (real) [this.wanted, this.standIn] = [real, false];
    else this.standIn = true;
  }

  /** A tap at (x, y), in tiles: them, or someone else, or nobody. */
  tap(x: number, y: number, about: readonly Findable[]): void {
    if (this.done || !this.wanted) return;
    const near = (f: Findable) => Math.hypot(f.x - x, f.y - y) <= NEAR;
    if (near(this.wanted)) {
      this.found.push(this.wanted.id);
      this.sparkle = { x: this.wanted.x, y: this.wanted.y, left: SPARKLE };
      this.say(`Found ${this.wanted.name}!`);
      this.wanted = null;
      if (!this.done) this.next(about);
      return;
    }
    const other = about.filter(near).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0];
    if (other) this.say(`That's ${other.name}!`);
  }

  /** Someone to find: not found yet if there's anyone left, and never the one just found. Out, or a stand-in outdoors. */
  private next(about: readonly Findable[]): void {
    const last = this.found.at(-1);
    const fresh = this.town.filter((t) => !this.found.includes(t.id));
    const left = fresh.length ? fresh : this.town.filter((t) => t.id !== last);
    const who = left[Math.floor(this.random() * left.length)];
    const out = who && about.find((f) => f.id === who.id);
    const spot = who && !out ? this.place() : null;
    this.wanted = out ?? (who && spot ? { ...who, x: spot[0], y: spot[1] } : null);
    this.standIn = !out;
    this.looking = 0;
  }

  private say(text: string): void {
    this.said = { text, left: SAID };
  }
}

/** Everyone from town who could be wanted: those who live or work here, people and pets (not visitors or crews passing through). */
export function townsfolk(sim: Simulation): Townsperson[] {
  return sim.people.filter((p) => !p.leaving && !['visitor', 'crew', 'courier'].includes(p.role ?? '')).map((p) => ({ id: p.id, name: p.name }));
}

/** Who's out and about in town, where they can be seen (on foot, not in a car, nor leaving town). */
export function aboutTown(sim: Simulation): Findable[] {
  const town = sim.traffic.level;
  if (!town) return [];
  return sim
    .peopleOn(town)
    .filter((p) => sim.present(p) && !p.leaving && p.role !== 'visitor')
    .map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y }));
}

/** A spot outdoors near `from` for a stand-in: grass, a path or sand, somewhere you can walk. */
export function standingSpot(sim: Simulation, from: Tile, random: () => number): Tile | null {
  const town = sim.traffic.level;
  const grid = town ? sim.grids.get(town) : undefined;
  const level = town ? sim.levels.get(town) : undefined;
  if (!grid || !level) return null;
  for (let tries = 0; tries < 300; tries++) {
    const [x, y] = [Math.round(from[0] + (random() * 2 - 1) * RANGE), Math.round(from[1] + (random() * 2 - 1) * RANGE)];
    if (grid.inBounds(x, y) && grid.free(x, y) && STAND_ON.has(level.rooms[grid.roomAt(x, y)]?.floor ?? '')) return [x, y];
  }
  return null;
}

/** Find it, as the runner plays it: looked for on the map you move yourself, by tapping. */
class FindRound implements TownRound {
  readonly game: FindIt;
  private about: Findable[];

  constructor(game: FindIt, about: Findable[]) {
    this.game = game;
    this.about = about;
  }

  step(_input: Input, dt: number, sim: Simulation): void {
    this.about = aboutTown(sim);
    this.game.step(dt, this.about);
  }

  tap(x: number, y: number): void {
    this.game.tap(x, y, this.about);
  }

  /** Whoever's wanted, if they're not out for real: their stand-in, waiting (night darkens them, as it does everyone). */
  paint(ctx: Ctx, _time: number, portrait: Portrait): void {
    const wanted = this.game.wanted;
    const sprite = wanted && this.game.standIn ? portrait(wanted.id) : null;
    if (wanted && sprite) standAt(ctx, sprite, wanted.x, wanted.y);
  }

  /** Bright after dark too: the ring closing in round them when you're stuck, and a sparkle round a find. */
  mark(ctx: Ctx, time: number): void {
    const { game } = this;
    const wanted = game.wanted;
    // Stuck: a ring round them, closing in.
    if (wanted && game.hinting) {
      const closing = Math.min(1, (game.looking - HINT_AFTER) / RING.closes);
      const r = (RING.wide - (RING.wide - 1.5) * closing) * TILE + Math.sin(time * 5) * 2;
      // Not quite on them till it's closed in: round a spot near them, so there's still some looking to do.
      const off = (1 - closing) * 2 * TILE;
      const [cx, cy] = [(wanted.x + 0.5) * TILE + off * Math.cos(game.time), (wanted.y + 0.5) * TILE + off * Math.sin(game.time)];
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(Math.round(cx), Math.round(cy), Math.round(r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (game.sparkle) {
      const { x, y, left } = game.sparkle;
      const spread = (1 - left / SPARKLE) * 14 + 4;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.fillStyle = i % 2 ? GOLD : '#ffffff';
        ctx.fillRect(Math.round((x + 0.5) * TILE + Math.cos(a) * spread) - 1, Math.round((y + 0.2) * TILE + Math.sin(a) * spread) - 1, 3, 3);
      }
    }
  }

  get done(): boolean {
    return this.game.done;
  }

  get stars(): number {
    return this.game.stars;
  }

  bar(): Bar {
    const { game } = this;
    const wanted = game.wanted;
    return {
      say: game.said?.text ?? (game.done ? 'All found!' : wanted ? `Find ${wanted.name}` : 'Finding someone…'),
      who: game.said ? undefined : wanted?.id,
      chips: Array.from({ length: game.finds }, (_, i) => ({ colour: GOLD, done: i < game.found.length, title: `Find ${i + 1}` })),
      time: clock(game.time),
      way: wanted && game.hinting ? { to: wanted, colour: GOLD } : null,
    };
  }

  /** Looking round is up to you. */
  focus(): null {
    return null;
  }

  result(): string {
    return `Found them all in ${clock(this.game.time)}!`;
  }
}

export const FIND_IT: TownGameDef = {
  title: '🔍 Find it',
  pad: false,
  /** Someone to find: anyone from town, out or (as a stand-in) waiting near the noticeboard. */
  plan: (sim, from, random) => {
    const town = townsfolk(sim);
    if (!town.length) return null;
    const about = aboutTown(sim);
    return new FindRound(new FindIt(town, about, () => standingSpot(sim, from, random), random), about);
  },
};
