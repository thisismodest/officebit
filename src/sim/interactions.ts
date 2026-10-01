// Interactions (docs/INTERACTIONS.md): things you can do to the town from
// outside. Put on an office event (pizza, delivered by a rider from the edge
// of town; a fire drill), or take control of someone. Like feed messages, these are inputs to the story,
// not randomness, so replays stay true.
import { TICKS_PER_HOUR } from './clock.ts';
import type { Intent, Person } from './person.ts';
import { outsideDoor } from './places.ts';
import type { Brain, Item, Simulation } from './sim.ts';
import type { Place, Tile } from './world.ts';

/** A fire drill: how long it lasts (filing out from upstairs takes a while), and how far from the door people wait. */
const DRILL_TICKS = 0.5 * TICKS_PER_HOUR;
const MUSTER_RADIUS = 4;
/** Slices of pizza in a delivery, and how long it lasts before it's cleared away. */
const SLICES = 10;
const PIZZA_TICKS = 2 * TICKS_PER_HOUR;

interface Delivery {
  courier: string;
  company: string;
  /** Where the pizza goes: beside the office's kitchen table. */
  to: Place;
  pizza?: Item;
  delivered: boolean;
  until: number;
}

interface Drill {
  company: string;
  /** The tile outside the front door. */
  door: Place;
  until: number;
}

export class Interactions {
  private readonly sim: Simulation;
  private readonly deliveries: Delivery[] = [];
  private readonly drills: Drill[] = [];
  private readonly controlled = new Map<string, ControlledBrain>();
  private couriers = 0;

  constructor(sim: Simulation) {
    this.sim = sim;
  }

  // ── Office events ─────────────────────────────────────────────────────────

  /** Order pizza for a company: a rider brings it from the edge of town to the office kitchen. */
  pizza(company: string): string | null {
    const { sim } = this;
    const to = this.kitchenOf(company);
    if (!to) return 'That workplace has nowhere to put pizza.';
    const id = `courier-${++this.couriers}`;
    const courier = sim.addNpc({ id, name: 'Pizza rider', species: 'human', look: [2, 3, 1, 0], home: '', role: 'courier' });
    sim.setBrain(id, new CourierBrain(this, id));
    this.deliveries.push({ courier: courier.id, company, to, delivered: false, until: Infinity });
    sim.log(`🍕 ${sim.companies.get(company)?.name ?? 'Someone'} ordered pizza`, []);
    return null;
  }

  /** A fire drill: everyone in the building files out and waits by the door. */
  drill(company: string): string | null {
    const { sim } = this;
    const levels = new Set(sim.companies.get(company)?.levels ?? []);
    const door = outsideDoor(sim, levels);
    if (!door) return 'That workplace has no way out.';
    const inside = this.inside(levels);
    if (inside.length === 0) return 'Nobody is in.';
    const drill = { company, door, until: sim.tick + DRILL_TICKS };
    this.muster(inside, drill);
    this.drills.push(drill);
    sim.log(`🔔 Fire drill at ${sim.companies.get(company)?.name}: everyone out`, inside.map((p) => p.id));
    return null;
  }

  /** Is a fire drill on in the building this level belongs to? */
  drillAt(level: string): boolean {
    return this.drills.some((d) => this.sim.companies.get(d.company)?.levels.includes(level));
  }

  /** Is a fire drill on anywhere (for the muffled alarm heard from the street)? */
  get drilling(): boolean {
    return this.drills.length > 0;
  }

  // ── Control ───────────────────────────────────────────────────────────────

  /** Take control of someone (`on`), or let go of them. Their personality takes over again when you let go. */
  control(p: Person, on: boolean): void {
    const { sim } = this;
    if (on) {
      const brain = new ControlledBrain();
      this.controlled.set(p.id, brain);
      sim.setBrain(p.id, brain);
    } else {
      this.controlled.delete(p.id);
      sim.clearBrain(p.id);
    }
    sim.interrupt(p);
  }

  isControlled(p: Person): boolean {
    return this.controlled.has(p.id);
  }

  /** Tell a controlled person what to do next. */
  command(p: Person, intent: Intent): void {
    const brain = this.controlled.get(p.id);
    if (!brain) return;
    brain.next = intent;
    this.sim.interrupt(p);
  }

  // ── Every step ────────────────────────────────────────────────────────────

  step(): void {
    const { sim } = this;
    for (const p of sim.people) {
      if (p.muster && sim.tick >= p.muster.until) {
        delete p.muster;
        sim.interrupt(p);
      }
    }
    for (const drill of [...this.drills]) {
      // Anyone who turns up mid-drill waits outside too.
      if (sim.tick < drill.until) {
        this.muster(this.inside(new Set(sim.companies.get(drill.company)?.levels ?? [])).filter((p) => !p.muster), drill);
        continue;
      }
      this.drills.splice(this.drills.indexOf(drill), 1);
      sim.log(`🔔 All clear at ${sim.companies.get(drill.company)?.name}`, []);
    }
    for (const delivery of [...this.deliveries]) {
      const courier = sim.person(delivery.courier);
      // Eaten, or gone cold: cleared away.
      if (delivery.pizza && (delivery.pizza.uses >= SLICES || sim.tick >= delivery.until) && !delivery.pizza.gone) sim.removeItem(delivery.pizza);
      if (delivery.delivered && (!courier || courier.hidden) && (!delivery.pizza || delivery.pizza.gone)) {
        if (courier) sim.removePerson(courier.id);
        this.deliveries.splice(this.deliveries.indexOf(delivery), 1);
      }
    }
  }

  /** The courier's job: walk to the kitchen, leave the pizza, walk away. */
  deliveryFor(courier: string): Delivery | undefined {
    return this.deliveries.find((d) => d.courier === courier);
  }

  /** The rider has reached the kitchen: pizza's here. */
  deliver(delivery: Delivery): void {
    const { sim } = this;
    delivery.delivered = true;
    delivery.pizza = sim.addItem(delivery.to.level, { t: 'pizza', p: delivery.to.p, label: 'Pizza' });
    delivery.until = sim.tick + PIZZA_TICKS;
    const eaters = sim.people.filter((p) => sim.companies.get(delivery.company)?.levels.includes(p.level) && sim.present(p));
    sim.log(`🍕 Pizza's here! It's in the kitchen`, eaters.map((p) => p.id));
  }

  /** A free floor tile beside the company's kitchen table (or any table), with room to stand round it. */
  private kitchenOf(company: string): Place | null {
    return kitchenIn(this.sim, this.sim.companies.get(company)?.levels ?? []);
  }

  private inside(levels: Set<string>): Person[] {
    return this.sim.people.filter((p) => levels.has(p.level) && this.sim.present(p) && p.species === 'human');
  }

  private muster(people: Person[], drill: Drill): void {
    for (const p of people) {
      p.muster = { to: this.musterSpot(drill.door), until: drill.until };
      this.sim.interrupt(p);
    }
  }

  /** Somewhere near the door to wait: on the pavement or the grass, not in the road. */
  private musterSpot(door: Place): Place {
    const grid = this.sim.grids.get(door.level)!;
    const level = this.sim.levels.get(door.level)!;
    for (let tries = 0; tries < 40; tries++) {
      const x = door.p[0] + this.sim.rng.int(-MUSTER_RADIUS, MUSTER_RADIUS);
      const y = door.p[1] + this.sim.rng.int(-1, MUSTER_RADIUS);
      const floor = level.rooms[grid.roomAt(x, y)]?.floor;
      if (grid.walkable(x, y) && (floor === 'path' || floor === 'grass')) return { level: door.level, p: [x, y] as Tile };
    }
    return door;
  }
}

/** A person you're steering: does what it's told, and otherwise stands still. */
export class ControlledBrain implements Brain {
  next: Intent | null = null;

  decide(p: Person): Intent {
    const next = this.next;
    this.next = null;
    return next ?? { kind: 'wander', to: { level: p.level, p: [Math.round(p.x), Math.round(p.y)] } };
  }
}

/** The pizza rider: to the kitchen, drop it off, back out of town. */
export class CourierBrain implements Brain {
  private readonly events: Interactions;
  private readonly id: string;

  constructor(events: Interactions, id: string) {
    this.events = events;
    this.id = id;
  }

  decide(p: Person): Intent {
    const delivery = this.events.deliveryFor(this.id);
    if (!delivery || delivery.delivered) return { kind: 'leave' };
    const [x, y] = delivery.to.p;
    if (p.level === delivery.to.level && Math.abs(p.x - x) + Math.abs(p.y - y) <= 1.5) {
      this.events.deliver(delivery);
      return { kind: 'leave' };
    }
    // Stand next to where the pizza goes.
    return { kind: 'wander', to: { level: delivery.to.level, p: [x, y + 1] } };
  }
}

/** A free floor tile beside a kitchen table, counter or any table on these levels, with room to stand round it: where pizza (or a cake) goes. */
export function kitchenIn(sim: Simulation, levels: readonly string[]): Place | null {
  const items = sim.activeItems();
  const tables = items.filter((i) => levels.includes(i.level) && ['smallTable', 'table', 'counter'].includes(i.def.t));
  for (const table of tables) {
    const grid = sim.grids.get(table.level)!;
    const [w, h] = table.type.size;
    for (let y = table.def.p[1] - 2; y <= table.def.p[1] + h + 1; y++) {
      for (let x = table.def.p[0] - 2; x <= table.def.p[0] + w + 1; x++) {
        const around = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) => grid.walkable(x + dx!, y + dy!)).length;
        if (grid.walkable(x, y) && around >= 3 && !items.some((i) => i.level === table.level && i.def.p[0] === x && i.def.p[1] === y)) {
          return { level: table.level, p: [x, y] };
        }
      }
    }
  }
  return null;
}
