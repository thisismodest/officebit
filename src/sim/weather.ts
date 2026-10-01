// Weather (docs/TIME.md#weather): dry, grey, rain or snow, in spells of a few
// hours, about as often as an English year has them (more rain in autumn and
// winter; snow now and then in the coldest months). Worked out from the
// world's seed and the date alone, so it's the same weather for everyone on
// the same day, and looking at it never changes the story. Wet weather keeps
// people in: brain.ts and plans.ts ask how wet it is.
import { TICKS_PER_HOUR } from './clock.ts';
import { Rng, hashOf } from './rng.ts';
import type { Simulation } from './sim.ts';

export type Sky = 'clear' | 'grey' | 'rain' | 'snow';

export interface Weather {
  sky: Sky;
  /** How hard it's raining or snowing, 0–1 (0 when it isn't). */
  wet: number;
}

/** How long a spell of weather lasts (game hours). */
const SPELL_HOURS = 4;
/** The chance a spell is wet, by month (January first), and of the rest, that it's grey. */
const WET: readonly number[] = [0.42, 0.36, 0.34, 0.3, 0.28, 0.26, 0.26, 0.28, 0.3, 0.38, 0.42, 0.42];
const GREY = 0.4;
/** Months it may snow (1–12), and the share of their wet spells that do. */
const SNOW_MONTHS = new Set([12, 1, 2]);
const SNOW = 0.3;
/** How long snow lies after it stops (game hours). */
const LIES_HOURS = 12;
/** Mixing the world's seed for the weather's own sums. */
const WEATHER_SEED = 0x5e7a1d;

export class Skies {
  private readonly sim: Simulation;
  /** The last spell worked out (asked about for everyone walking, every step). */
  private last: { spell: number; seed: number; start: string; weather: Weather } | null = null;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** The weather at a tick (now, if not given). */
  at(tick = this.sim.tick): Weather {
    const spell = Math.floor(tick / (SPELL_HOURS * TICKS_PER_HOUR));
    const { seed } = this.sim.world;
    const start = `${this.sim.calendar.start.join()}|${this.sim.firstDay}`;
    if (this.last?.spell === spell && this.last.seed === seed && this.last.start === start) return this.last.weather;
    const weather = this.work(spell);
    this.last = { spell, seed, start, weather };
    return weather;
  }

  private work(spell: number): Weather {
    // Each spell's own dice (mixed well: neighbouring spells' names hash alike).
    const roll = (what: string) => new Rng(hashOf(`${what}:${spell}`, this.sim.world.seed ^ WEATHER_SEED)).next();
    const { month } = this.sim.dateOf(spell * SPELL_HOURS * TICKS_PER_HOUR);
    if (roll('wet') < WET[month - 1]!) {
      const wet = 0.35 + 0.65 * roll('heavy');
      return { sky: SNOW_MONTHS.has(month) && roll('snow') < SNOW ? 'snow' : 'rain', wet };
    }
    return { sky: roll('grey') < GREY ? 'grey' : 'clear', wet: 0 };
  }

  /** How wet it is (0–1): rain or snow falling. */
  wet(tick = this.sim.tick): number {
    return this.at(tick).wet;
  }

  /** How much snow is lying (0–1): it settles while it falls, and thaws over half a day after it stops. */
  snowLying(tick = this.sim.tick): number {
    const spell = SPELL_HOURS * TICKS_PER_HOUR;
    for (let back = 0; back <= LIES_HOURS / SPELL_HOURS; back++) {
      const then = tick - back * spell;
      if (this.at(then).sky !== 'snow') continue;
      // Since that spell ended (0 while it's still snowing).
      const since = Math.max(0, tick - (Math.floor(then / spell) + 1) * spell);
      return Math.max(0, 1 - since / (LIES_HOURS * TICKS_PER_HOUR));
    }
    return 0;
  }
}
