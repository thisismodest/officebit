// Housing (docs/LOVE.md#moving-house): which house on the map holds which
// home, which are to let, and moving people between them. A home's name
// follows whoever lives there; an empty one is "To let" until someone takes it.
import type { Person } from './person.ts';
import { interiorOf } from './places.ts';
import type { Item, Simulation } from './sim.ts';
import type { LevelDef } from './world.ts';

/** House types on a map, smallest first: a terrace is a one-bed, a semi a two-bed, detached a family home. */
const SIZES: Record<string, number> = { terrace: 1, house: 2, detached: 3 };
export const TO_LET = 'To let';

export interface Home {
  /** The house on the map. */
  item: Item;
  /** The home inside it. */
  level: LevelDef;
  /** 1 (a terrace) to 3 (detached). */
  size: number;
}

export class Housing {
  private readonly sim: Simulation;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  /** Every house with a home inside. */
  homes(): Home[] {
    return this.sim.activeItems().flatMap((item): Home[] => {
      const size = SIZES[item.def.t];
      const level = size ? interiorOf(this.sim, item)?.levels[0] : undefined;
      return size && level?.kind === 'home' ? [{ item, level, size }] : [];
    });
  }

  homeOf(level: string | undefined): Home | undefined {
    return this.homes().find((h) => h.level.id === level);
  }

  residents(home: Home): Person[] {
    return this.sim.people.filter((p) => p.home === home.level.id);
  }

  /** Empty homes, smallest first. */
  vacant(): Home[] {
    return this.homes()
      .filter((h) => this.residents(h).length === 0)
      .sort((a, b) => a.size - b.size);
  }

  /** Move people into a home, bringing the family and pets who live with them. Homes left empty go up to let. */
  move(people: Person[], to: Home): void {
    const left = new Set<string>();
    for (const p of people) {
      const from = p.home;
      if (from === to.level.id) continue;
      // Family and pets come too, if `p` is who they live with.
      const family = this.sim.people.filter((q) => q.npc && q.home === from && q.role !== 'staff' && q !== p);
      for (const q of [p, ...family]) this.setHome(q, to.level.id);
      if (from) left.add(from);
    }
    for (const id of left) {
      const home = this.homeOf(id);
      if (home && this.residents(home).length === 0) this.name(home, TO_LET, undefined);
    }
    this.sim.touch([to.level.id, ...left]);
  }

  /** Name a home after who lives there ("Bea's house", "Bea and Lou's house"), and whose house it is on the map. */
  name(home: Home, name: string, owner: Person | undefined): void {
    home.level.name = name;
    const main = home.level.rooms[0];
    if (main) main.name = name;
    if (owner) home.item.def.owner = owner.id;
    else delete home.item.def.owner;
  }

  /** The name a home should have for the people in it. */
  nameFor(people: Person[]): string {
    const names = people.filter((p) => !p.npc || p.role === 'staff').map((p) => p.name);
    if (names.length === 0) return TO_LET;
    return `${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`}'s house`;
  }

  private setHome(p: Person, level: string): void {
    p.home = level;
    const def = this.sim.world.people.find((d) => d.id === p.id) ?? this.sim.world.npcs.find((d) => d.id === p.id);
    if (def) def.home = level;
  }
}
