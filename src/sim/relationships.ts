// Relationships (docs/RELATIONSHIPS.md). Every pair has a fixed compatibility,
// from their traits and a little seeded chance, and an affinity from −1 to 1
// that drifts towards it as they spend time together. Interruptions, and being
// kept from work, sour it.
// Friends seek each other out; people who dislike each other keep apart.
import type { Person } from './person.ts';
import { Rng } from './rng.ts';

/** Affinity at which people count as friends, and as not getting on. */
export const FRIENDS = 0.5;
export const DISLIKE = -0.3;
/** How fast affinity closes in on where the pair is heading, per tick spent together. */
const BONDING = 0.002;
/** Time together makes most people like each other a little more: added to where they're heading. */
const FAMILIARITY = 0.08;
/** Affinity lost by the interrupted, scaled by how much they mind (diligence). */
const INTERRUPTION = 0.04;
/** And lost for every tick they're kept talking instead of working, scaled the same way. */
const DISTRACTING = 0.0005;
/** Where people who live together start, and the least compatible they can be: they chose each other. */
const HOUSEHOLD = 0.7;
const HOUSEHOLD_FLOOR = 0.5;
/** A pair must drift back past these before crossing the line is news again. */
const FRIENDS_RESET = 0.3;
const DISLIKE_RESET = -0.1;

/** How the relationship between two people changed, if it crossed a line worth mentioning. */
export type Turn = 'friends' | 'fell-out' | null;

export class Relationships {
  private readonly affinities = new Map<string, number>();
  private readonly compatibilities = new Map<string, number>();
  private readonly households = new Set<string>();
  /** Lines each pair has crossed and not yet drifted back from. */
  private readonly announced = new Map<string, Turn>();
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  /** How well two people get on, −1 (can't stand each other) to 1 (best friends). */
  affinity(a: Person, b: Person): number {
    return this.affinities.get(pairKey(a, b)) ?? 0;
  }

  /**
   * How well they'd get on, given time: −1 to 1, fixed for the pair. Similar
   * people get on; diligent and chaotic people grate; charm helps; and some
   * of it is just chemistry.
   */
  compatibility(a: Person, b: Person): number {
    const key = pairKey(a, b);
    let value = this.compatibilities.get(key);
    if (value === undefined) {
      const [x, y] = [a.traits, b.traits];
      const alike = 1 - (Math.abs(x.social - y.social) + Math.abs(x.chaos - y.chaos) + Math.abs(x.diligence - y.diligence)) / 3;
      const clash = x.diligence * y.chaos + y.diligence * x.chaos;
      const charm = (x.charisma + y.charisma) / 2;
      const chemistry = new Rng(hashKey(key, this.seed)).range(-1, 1);
      value = clamp(0.9 * (alike - 0.5) - 0.35 * clash + 0.3 * charm + 0.45 * chemistry);
      if (this.households.has(key)) value = Math.max(value, HOUSEHOLD_FLOOR);
      this.compatibilities.set(key, value);
    }
    return value;
  }

  /** People who live together start out close. */
  household(a: Person, b: Person): void {
    const key = pairKey(a, b);
    this.households.add(key);
    this.compatibilities.delete(key);
    this.affinities.set(key, HOUSEHOLD);
    this.announced.set(key, 'friends');
  }

  /** Time spent together (`ticks` of it): affinity closes in on how well they're suited, plus `lift` (being in love). */
  together(a: Person, b: Person, ticks: number, lift = 0): Turn {
    const heading = clamp(this.compatibility(a, b) + FAMILIARITY + lift);
    return this.shift(a, b, (heading - this.affinity(a, b)) * Math.min(1, BONDING * ticks));
  }

  /** `by` interrupted `target` at work. */
  interrupted(by: Person, target: Person): Turn {
    return this.shift(by, target, -INTERRUPTION * (0.5 + target.traits.diligence));
  }

  /** `by` is keeping `target` from their work, `ticks` of it: no bonding, just grating. */
  distracting(by: Person, target: Person, ticks: number): Turn {
    return this.shift(by, target, -DISTRACTING * ticks * (0.5 + target.traits.diligence));
  }

  /** Everyone `p` has feelings about, strongest first. */
  of(p: Person, people: readonly Person[]): [Person, number][] {
    return people
      .filter((q) => q !== p)
      .map((q): [Person, number] => [q, this.affinity(p, q)])
      .filter(([, a]) => a !== 0)
      .sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  }

  /** Forget someone who's left for good. */
  forget(id: string): void {
    for (const key of this.households) if (key.split('|').includes(id)) this.households.delete(key);
    for (const map of [this.affinities, this.compatibilities, this.announced]) {
      for (const key of map.keys()) if (key.split('|').includes(id)) map.delete(key);
    }
  }

  private shift(a: Person, b: Person, amount: number): Turn {
    const key = pairKey(a, b);
    const before = this.affinities.get(key) ?? 0;
    const after = clamp(before + amount);
    this.affinities.set(key, after);
    // Only news the first time they cross a line, until they've drifted well back from it.
    const said = this.announced.get(key);
    if ((said === 'friends' && after < FRIENDS_RESET) || (said === 'fell-out' && after > DISLIKE_RESET)) this.announced.delete(key);
    const turn: Turn = before < FRIENDS && after >= FRIENDS ? 'friends' : before > DISLIKE && after <= DISLIKE ? 'fell-out' : null;
    if (!turn || this.announced.get(key) === turn) return null;
    this.announced.set(key, turn);
    return turn;
  }
}

function pairKey(a: Person, b: Person): string {
  return a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
}

function hashKey(key: string, seed: number): number {
  return [...key].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), seed ^ 0x9e3779b9);
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
