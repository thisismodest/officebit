// Birthdays (docs/PEOPLE.md#birthdays): everyone has one (set on their
// profile, or worked out from who they are). On the day they're a bit more
// cheerful, wear a party hat, and it's in the News; at work they bring in a
// cake for the kitchen (or at home, for the family, in the evening), and
// whoever's about comes for a slice till it's gone.
import { TICKS_PER_HOUR, dayOf, hourOf } from './clock.ts';
import { civilFromDays, daysFromCivil } from './calendar.ts';
import { kitchenIn } from './interactions.ts';
import type { Person } from './person.ts';
import { hashOf } from './rng.ts';
import type { Item, Simulation } from './sim.ts';

/** On the day: how much fun and company they wake up with, on top of what they had. */
const BOOST = { fun: 0.3, social: 0.2 };
/** Slices in a cake, and the latest it stays out (game hours). */
const SLICES = 8;
const CAKE_HOURS = 6;
/** A family's cake comes out at home from this hour of the evening. */
const TEATIME = 17;

/** Someone's birthday, [month, day]: their own, or one that's steady for who they are (never 29 February). */
export function birthdayOf(def: { id: string; birthday?: [number, number] }, seed: number): [number, number] {
  if (def.birthday) return def.birthday;
  const n = (hashOf(`birthday:${def.id}`, seed) >>> 0) % 365;
  const { month, day } = civilFromDays(daysFromCivil(2001, 1, 1) + n);
  return [month, day];
}

interface Cake {
  item: Item;
  until: number;
}

export class Birthdays {
  private readonly sim: Simulation;
  /** Whose birthday it is today, and the day that was worked out for. */
  private today = new Set<string>();
  private day = -1;
  /** Who's had their cake out today. */
  private caked = new Set<string>();
  private readonly cakes: Cake[] = [];

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Is it their birthday today? (As of the last step: looking never changes anything.) */
  is(p: Person): boolean {
    return this.today.has(p.id);
  }

  /** Every step: a new day's birthdays (cheered up, and in the News), cakes brought out, and cakes eaten or cleared away. */
  step(): void {
    const { sim } = this;
    if (this.refresh()) {
      for (const id of this.today) {
        const p = sim.person(id);
        if (!p) continue;
        p.needs.fun = Math.min(1, p.needs.fun + BOOST.fun);
        p.needs.social = Math.min(1, p.needs.social + BOOST.social);
        sim.log(`🎂 It's ${p.name}'s birthday`, [p.id]);
      }
    }
    for (const id of this.today) {
      if (this.caked.has(id)) continue;
      const p = sim.person(id);
      if (p) this.bringCake(p);
    }
    for (const cake of [...this.cakes]) {
      if (cake.item.gone || cake.item.uses >= SLICES || sim.tick >= cake.until) {
        if (!cake.item.gone) sim.removeItem(cake.item);
        this.cakes.splice(this.cakes.indexOf(cake), 1);
      }
    }
  }

  /** A new day (from 06:00): whose birthday it is. True when it's changed. */
  private refresh(): boolean {
    const { sim } = this;
    const day = dayOf(sim.tick);
    if (day === this.day) return false;
    this.day = day;
    this.caked.clear();
    const { month, day: date } = sim.dateOf();
    // The team, and anyone else who lives here (family, children, pets, staff): not crews or people passing through.
    const celebrating = sim.people.filter((p) => {
      const def = sim.defOf(p.id);
      if (!def || (p.npc && !p.home)) return false;
      const [m, d] = birthdayOf(def, sim.world.seed);
      return m === month && d === date;
    });
    this.today = new Set(celebrating.map((p) => p.id));
    return true;
  }

  /** At work on a working day, they bring a cake in for the kitchen; family have theirs at home, at teatime. Pets have the hat and the fuss. */
  private bringCake(p: Person): void {
    const { sim } = this;
    if (p.species !== 'human' || !sim.present(p)) return;
    const company = p.company ? sim.companies.get(p.company) : undefined;
    const atWork = !!company && !sim.dayOff() && company.levels.includes(p.level);
    const atHome = !atWork && !!p.home && p.level === p.home && hourOf(sim.tick) >= TEATIME;
    if (!atWork && !atHome) return;
    const spot = kitchenIn(sim, atWork ? company!.levels : [p.home!]);
    if (!spot) return;
    const item = sim.addItem(spot.level, { t: 'birthdayCake', p: spot.p, label: `${p.name}'s birthday cake` });
    if (!item) return;
    this.caked.add(p.id);
    this.cakes.push({ item, until: sim.tick + CAKE_HOURS * TICKS_PER_HOUR });
    sim.log(atWork ? `🎂 ${p.name} brought in a cake for ${company!.name}` : `🎂 Birthday cake for ${p.name} at home`, [p.id]);
  }
}
