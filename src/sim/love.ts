// Love (docs/LOVE.md). Single adults who are good friends, and have a spark,
// may ask each other out. Dating couples have date nights at the diner; after
// a week or so, if it's going well, they move in together, into a bigger home
// if they both had small ones. It can end, quietly. Children, crews and people
// already spoken for are never involved, and a world (or anyone in it) can
// opt out: `"love": false`, `"romance": false`.
import { TICKS_PER_DAY, TICKS_PER_HOUR, hourOf } from './clock.ts';
import type { Home } from './housing.ts';
import type { Person } from './person.ts';
import { pairKey } from './relationships.ts';
import { Rng, hashOf } from './rng.ts';
import type { Simulation } from './sim.ts';
import { roleOf } from './roles.ts';

/** Affinity at which someone might ask a friend out. */
const ASK_AFFINITY = 0.5;
/** The share of pairs with a spark. The rest stay friends. */
const SPARK = 0.4;
/** Being in love: how much higher a couple's affinity heads as they spend time together. */
export const IN_LOVE = 0.3;
/** Chance per conversation, between two people with a spark, that one asks. */
const ASK_CHANCE = 0.15;
/** Date nights start at 18:00, on about this share of evenings, and last this long. */
const DATE_HOUR = 18;
const DATE_CHANCE = 0.5;
const DATE_TICKS = 3.5 * TICKS_PER_HOUR;
/** Moving in: after this many days together, if they get on at least this well. */
const MOVE_IN_DAYS = 7;
const MOVE_IN_AFFINITY = 0.75;
/** Below this, it's over. */
const SPLIT_AFFINITY = 0.2;

export interface Couple {
  a: string;
  b: string;
  since: number;
  /** Living together. */
  together: boolean;
}

export class Love {
  readonly couples: Couple[] = [];
  private readonly sim: Simulation;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Is this world one where people fall in love? */
  get enabled(): boolean {
    return this.sim.world.love !== false;
  }

  coupleOf(p: Person): Couple | undefined {
    return this.couples.find((c) => c.a === p.id || c.b === p.id);
  }

  partnerOf(p: Person): Person | undefined {
    const couple = this.coupleOf(p);
    return couple && this.sim.person(couple.a === p.id ? couple.b : couple.a);
  }

  /** Single, grown up, human, living in town, and not opted out. */
  available(p: Person): boolean {
    if (!roleOf(p).romance || !p.home || this.coupleOf(p)) return false;
    const def = this.sim.world.people.find((d) => d.id === p.id) ?? this.sim.world.npcs.find((d) => d.id === p.id);
    if (def?.romance === false) return false;
    // Someone who lives with a grown-up partner (the family at home) is spoken for.
    const spokenFor = this.sim.people.some((q) => q !== p && q.home === p.home && q.species === 'human' && q.role !== 'child');
    return !spokenFor;
  }

  /** A spark: fixed for the pair, seeded, and independent of how well they get on. */
  spark(a: Person, b: Person): boolean {
    return new Rng(hashOf(pairKey(a, b), this.sim.world.seed ^ 0x51ed270b)).next() < SPARK;
  }

  /** `a` has just started talking to `b`: good friends with a spark might become more. */
  met(a: Person, b: Person): void {
    const { sim } = this;
    if (!this.enabled || !this.available(a) || !this.available(b) || !this.spark(a, b)) return;
    if (sim.affinity(a, b) < ASK_AFFINITY || sim.rng.next() >= ASK_CHANCE) return;
    this.couples.push({ a: a.id, b: b.id, since: sim.tick, together: false });
    sim.log(`💘 ${a.name} asked ${b.name} out, and they said yes`, [a.id, b.id]);
  }

  hourly(): void {
    const { sim } = this;
    const hour = Math.round(hourOf(sim.tick));
    for (const couple of [...this.couples]) {
      const a = sim.person(couple.a);
      const b = sim.person(couple.b);
      if (!a || !b) {
        this.couples.splice(this.couples.indexOf(couple), 1);
        continue;
      }
      if (sim.affinity(a, b) < SPLIT_AFFINITY) {
        this.split(couple, a, b);
        continue;
      }
      if (!couple.together && hour === DATE_HOUR && sim.rng.next() < DATE_CHANCE) {
        a.date = { with: b.id, until: sim.tick + DATE_TICKS };
        b.date = { with: a.id, until: sim.tick + DATE_TICKS };
      }
      const long = sim.tick - couple.since >= MOVE_IN_DAYS * TICKS_PER_DAY;
      if (!couple.together && long && hour === 10 && sim.affinity(a, b) >= MOVE_IN_AFFINITY) this.moveIn(couple, a, b);
    }
  }

  /** Both on a date at the same place: that's news, once a date. */
  arrived(p: Person, venue: string): void {
    const partner = p.date && this.sim.person(p.date.with);
    if (!p.date || !partner?.date || partner.level !== venue || p.date.noticed) return;
    p.date.noticed = partner.date.noticed = true;
    const place = this.sim.levels.get(venue)?.name ?? 'town';
    this.sim.log(`💞 ${partner.name} and ${p.name} are on a date at ${place}`, [p.id, partner.id]);
  }

  /** Into the bigger of their homes; or, if both are small (or there are children to fit in), a bigger one that's free. */
  private moveIn(couple: Couple, a: Person, b: Person): void {
    const { housing } = this.sim;
    const homes = [housing.homeOf(a.home), housing.homeOf(b.home)].filter((h): h is Home => !!h);
    const biggest = homes.sort((x, y) => y.size - x.size)[0];
    if (!biggest) return;
    const kids = this.sim.people.some((q) => q.role === 'child' && (q.home === a.home || q.home === b.home));
    const need = kids ? 3 : Math.max(2, biggest.size);
    const upsize = biggest.size < need ? housing.vacant().find((h) => h.size >= need) : undefined;
    const to = upsize ?? biggest;
    housing.move([a, b], to);
    housing.name(to, housing.nameFor(housing.residents(to)), a);
    couple.together = true;
    const where = upsize ? 'into a bigger house' : `at ${to === homes.find((h) => h.level.id === b.home) ? b.name : a.name}'s`;
    this.sim.log(`🏡 ${a.name} and ${b.name} have moved in together, ${where}`, [a.id, b.id]);
  }

  /** It's over. If they lived together, one of them moves out, if there's somewhere to go. */
  private split(couple: Couple, a: Person, b: Person): void {
    const { housing } = this.sim;
    this.couples.splice(this.couples.indexOf(couple), 1);
    this.sim.log(`💔 ${a.name} and ${b.name} have split up`, [a.id, b.id]);
    if (!couple.together) return;
    const away = housing.vacant()[0];
    const home = housing.homeOf(a.home);
    if (!away || !home) return;
    housing.move([b], away);
    housing.name(away, housing.nameFor([b]), b);
    housing.name(home, housing.nameFor(housing.residents(home)), a);
  }
}
