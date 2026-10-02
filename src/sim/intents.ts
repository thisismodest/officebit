// What each intent means in practice (docs/PEOPLE.md#intents): where someone
// goes to do it, how it starts when they get there, what it does every step,
// and whether it still suits the time of day. Brains choose intents; the sim
// walks people there and runs these. A new kind of activity is one entry in
// INTENTS, plus its shape in the Intent union (person.ts).
import { PANTRY_FULL, type Need, type Needs } from './needs.ts';
import { faceTowards, type Intent, type Person } from './person.ts';
import { outsideDoor } from './places.ts';
import type { DayPhase } from './schedule.ts';
import type { Item, Simulation } from './sim.ts';
import type { Place } from './world.ts';

/** How long things take, in ticks (6 game seconds each): a spell at the desk (scaled by diligence), a chat, a wander, a retreat, a meeting's slot. */
const WORK_SPELL: [number, number] = [150, 350];
const CHAT: [number, number] = [40, 90];
const WANDER: [number, number] = [20, 60];
const RETREAT: [number, number] = [80, 160];
/** A swim, and the fun and company it gives every tick. */
const SWIM: [number, number] = [80, 160];
const SWIMMING = { fun: 0.004, social: 0.001 };
/** A walk in the park, and the fun it gives every tick (more for those short of it: fresh air). */
const STROLL: [number, number] = [150, 300];
const STROLLING = 0.003;
const MEETING = 50;
/** Using furniture with no duration of its own. */
const USE: [number, number] = [30, 60];
/** Hunger restored by a takeaway, on top of whatever the sofa gives. */
const TAKEAWAY = 0.55;
/** Extra fun per tick from gaming, and social per tick from gaming with someone. */
const GAMING = { fun: 0.004, social: 0.003 };
/** Fun and social per tick from a game in the park (plans.ts). */
const PLAY = { fun: 0.004, social: 0.002 };
/** Fun per tick from a chat (with a pet, or pulling someone off their work, there's more). */
const CHAT_FUN = 0.0015;
/** How close (tiles) people must stay to keep a conversation going. */
const CHAT_REACH = 2;
/** How close they must get to start one. */
const CHAT_START = 1.6;
/** Giving up on a queue: the fun it costs. */
const GAVE_UP_FUN = 0.2;

/** Top up one of someone's needs, `perTick` for every tick this step covers. */
export type Refill = (who: Person, need: Need, perTick: number) => void;

interface Rules<I extends Intent> {
  /** Where to go to do it, claiming a seat or spot on the way. Null if it can't be done. */
  to(sim: Simulation, p: Person, intent: I): Place | null;
  /** They've got there: how long it'll take, which way they face, what it costs or gives. */
  start(sim: Simulation, p: Person, intent: I): void;
  /** Every step while they're at it. */
  doing?(sim: Simulation, p: Person, intent: I, refill: Refill): void;
  /** Does it still suit this part of their day, given where they may be (`area`)? */
  fits(sim: Simulation, p: Person, intent: I, phase: DayPhase, area: readonly string[]): boolean;
}

type Of<K extends Intent['kind']> = Extract<Intent, { kind: K }>;

const somewhere: Rules<Of<'wander'> | Of<'retreat'>>['fits'] = (_sim, _p, intent, _phase, area) => area.includes(intent.to.level);

export const INTENTS: { [K in Intent['kind']]: Rules<Of<K>> } = {
  work: {
    to: (sim, p) => {
      const desk = sim.items[p.desk];
      return desk && !desk.gone ? { level: desk.level, p: sim.spotTile(desk, 0) } : null;
    },
    start: (sim, p) => {
      p.facing = 'up';
      p.timer = Math.round(sim.rng.int(...WORK_SPELL) * (0.6 + p.traits.diligence));
    },
    doing: (sim, p) => {
      if (p.distracted > 0) return;
      p.focus = Math.min(1, p.focus + 0.004 * sim.dt);
      p.stats.work += (0.5 + p.focus) * sim.dt;
      p.stats.weekWork += (0.5 + p.focus) * sim.dt;
      sim.ventures.worked(p);
    },
    fits: (_sim, _p, _intent, phase) => phase === 'work',
  },

  hustle: {
    to: (sim, p, intent) => sim.claim(p, intent.item),
    start: (sim, p) => INTENTS.work.start(sim, p, { kind: 'work' }),
    doing: (sim, p, _intent, refill) => {
      // Ambitious people enjoy it; it's their idea of fun.
      refill(p, 'fun', 0.002 * p.traits.ambition);
      sim.ventures.hustled(p);
    },
    fits: (sim, _p, intent, phase, area) => phase === 'home' && area.includes(sim.items[intent.item]?.level ?? ''),
  },

  use: {
    to: (sim, p, intent) => sim.claim(p, intent.item),
    start: (sim, p, intent) => {
      const item = sim.items[intent.item]!;
      p.timer = sim.rng.int(...(item.type.duration ?? USE));
      sim.used(p, item);
      // A row on the river is the day's outing.
      if (item.type.boating) p.lastOuting = sim.tick;
      const offers: Partial<Needs> = { ...item.type.offers };
      eatFrom(sim, p, item);
      if (intent.mode === 'takeaway') {
        offers.hunger = (offers.hunger ?? 0) + TAKEAWAY;
        p.lastTakeaway = sim.tick;
        sim.log(`${p.name} ordered a takeaway`, [p.id]);
      }
      p.gains = Object.fromEntries(Object.entries(offers).map(([need, total]) => [need, total / p.timer]));
      if (item.type.seat) {
        // Face into the seating: down from a top bench, up from a bottom one.
        const middle = item.def.p[1] + (item.type.size[1] - 1) / 2;
        p.facing = p.y > middle ? 'up' : 'down';
      } else {
        faceTowards(p, item.def.p[0], item.def.p[1]);
      }
    },
    doing: (sim, p, intent, refill) => {
      const item = sim.items[intent.item]!;
      if (intent.mode === 'games') game(sim, p, item, refill);
      if (item.type.worksite) sim.construction.worked(p, item);
    },
    fits: (sim, p, intent, phase) => sim.canUse(p, sim.items[intent.item]!, phase),
  },

  chat: {
    to: (sim, p, intent) => {
      const target = sim.person(intent.with);
      return target ? sim.beside(p, target) : null;
    },
    start: (sim, p, intent) => {
      const target = sim.person(intent.with);
      if (!target || target.level !== p.level || Math.hypot(target.x - p.x, target.y - p.y) > CHAT_START) return sim.interrupt(p);
      p.timer = sim.rng.int(...CHAT);
      faceTowards(p, target.x, target.y);
      sim.social.engage(p, target);
    },
    doing: (sim, p, intent, refill) => {
      const target = sim.person(intent.with);
      if (!p.talkingTo || !target || target.level !== p.level || Math.hypot(target.x - p.x, target.y - p.y) > CHAT_REACH) return;
      const withPet = target.species !== 'human' || p.species !== 'human';
      refill(p, 'social', 0.008 * (0.5 + p.traits.social));
      refill(target, 'social', 0.004 * (0.5 + target.traits.social));
      // Pets are fun; pulling someone off their work is fun, for some.
      refill(p, 'fun', CHAT_FUN + (withPet ? 0.006 : 0) + (target.distracted > 0 ? 0.01 * p.traits.chaos : 0));
      if (withPet) refill(target, 'fun', 0.006);
      else sim.social.talked(p, target, sim.dt);
    },
    fits: (sim, _p, intent, _phase, area) => area.includes(sim.person(intent.with)?.level ?? ''),
  },

  play: {
    to: (_sim, _p, intent) => intent.spot,
    // At their place in the ring till the plan's over, facing its middle.
    start: (sim, p, intent) => {
      const plan = sim.plans.get(intent.plan);
      p.timer = Math.max(1, (plan?.end ?? sim.tick) - sim.tick);
      if (plan) faceTowards(p, plan.at[0], plan.at[1]);
    },
    doing: (_sim, p, _intent, refill) => {
      refill(p, 'fun', PLAY.fun);
      refill(p, 'social', PLAY.social);
    },
    fits: (sim, _p, intent, _phase, area) => area.includes(intent.spot.level) && sim.tick < (sim.plans.get(intent.plan)?.end ?? 0),
  },

  wander: {
    to: (_sim, _p, intent) => intent.to,
    start: (sim, p) => {
      p.timer = sim.rng.int(...WANDER);
    },
    doing: (_sim, p, _intent, refill) => refill(p, 'fun', 0.004 * p.traits.chaos),
    fits: somewhere,
  },

  // A swim in the shallows off a beach, on a summer's day: the day's outing.
  swim: {
    to: (_sim, _p, intent) => intent.to,
    start: (sim, p) => {
      p.timer = sim.rng.int(...SWIM);
      p.lastOuting = sim.tick;
    },
    doing: (_sim, p, _intent, refill) => {
      refill(p, 'fun', SWIMMING.fun);
      refill(p, 'social', SWIMMING.social);
    },
    fits: (sim) => sim.summerDay(),
  },

  // A walk in the park on a dry day: an outing (once a day, like any other).
  stroll: {
    to: (_sim, _p, intent) => intent.to,
    start: (sim, p) => {
      p.timer = sim.rng.int(...STROLL);
      p.lastOuting = sim.tick;
    },
    doing: (_sim, p, _intent, refill) => refill(p, 'fun', STROLLING),
    fits: (sim) => sim.daylight() > 0.3 && sim.weather.wet() === 0,
  },

  retreat: {
    to: (_sim, _p, intent) => intent.to,
    start: (sim, p) => {
      p.timer = sim.rng.int(...RETREAT);
    },
    fits: somewhere,
  },

  meeting: {
    to: (sim, p, intent) => {
      const table = sim
        .activeItems()
        .find((item) => item.type.meeting && item.level === intent.level && sim.roomOf(item) === intent.room && sim.freeSpots(item.index) > 0);
      return table ? sim.claim(p, table.index) : sim.randomWalkable(intent.level, intent.room);
    },
    start: (_sim, p) => {
      p.timer = MEETING;
    },
    doing: (sim, p, _intent, refill) => {
      refill(p, 'social', 0.002);
      // Meetings run for as long as the feed says so.
      if (p.timer <= sim.dt && p.status.activity === 'meeting') p.timer += MEETING;
    },
    fits: (_sim, _p, _intent, phase) => phase === 'work',
  },

  sleep: {
    to: (sim, p, intent) => sim.claim(p, intent.item),
    start: (sim, p, intent) => {
      p.timer = Math.max(1, intent.until - sim.tick);
      p.facing = 'down';
    },
    fits: () => true,
  },

  queue: {
    // In line on the pavement by the door, behind whoever's already waiting.
    to: (sim, p, intent) => {
      const door = outsideDoor(sim, new Set([intent.level]));
      if (!door) return null;
      const ahead = sim.people.filter((q) => q !== p && q.intent?.kind === 'queue' && q.intent.level === intent.level).length;
      const grid = sim.grids.get(door.level)!;
      const spot: [number, number] = [door.p[0] + ahead + 1, door.p[1] + 1];
      return grid.walkable(...spot) ? { level: door.level, p: spot } : door;
    },
    start: (_sim, p, intent) => {
      p.timer = intent.wait;
      p.facing = 'up';
    },
    doing: (sim, p, intent) => {
      // Open at last: in they go (they'll decide what to do once they're in).
      if (sim.venueOpen(intent.level)) {
        const inside = sim.randomWalkable(intent.level);
        if (inside) sim.walkOn(p, { kind: 'wander', to: inside });
        else sim.interrupt(p);
        return;
      }
      if (p.timer > sim.dt) return;
      p.lastGaveUp = sim.tick;
      p.needs.fun = Math.max(0, p.needs.fun - GAVE_UP_FUN);
      sim.log(`😤 ${p.name} gave up waiting for ${sim.levels.get(intent.level)?.name ?? 'somewhere'} to open`, [p.id]);
    },
    fits: () => true,
  },

  // Waiting for the bus (buses.ts): on the stop's bench if there's room, otherwise by it (or across the road, for the bus the other way); given up on after a while.
  bus: {
    to: (sim, p, intent) => sim.buses.waitingPlace(p, intent),
    start: (sim, p, intent) => {
      p.timer = sim.buses.patience;
      sim.buses.lookOut(p, intent);
    },
    doing: (sim, p, intent) => {
      if (p.timer <= sim.dt) sim.walkOn(p, intent.after);
    },
    fits: (sim, p, intent, phase, area) => rulesFor(intent.after).fits(sim, p, intent.after, phase, area),
  },

  // To their car (cars.ts), and off in it to a bay near where they're going.
  drive: {
    to: (sim, p) => {
      const at = sim.cars.doorOf(p);
      return at ? { level: sim.traffic.level ?? p.level, p: at } : sim.placeOf(p);
    },
    start: (sim, p, intent) => sim.cars.drive(p, intent),
    fits: (sim, p, intent, phase, area) => rulesFor(intent.after).fits(sim, p, intent.after, phase, area),
  },

  // Waiting at a gate for the plane (planes.ts): on its bench if there's room, otherwise by it; given up on after a while.
  fly: {
    to: (sim, p, intent) => sim.planes.waitingPlace(p, intent),
    start: (sim, p, intent) => {
      p.timer = sim.planes.patience;
      sim.planes.lookOut(p, intent);
    },
    doing: (sim, p, intent) => {
      if (p.timer <= sim.dt) sim.walkOn(p, intent.after);
    },
    fits: (sim, p, intent, phase, area) => rulesFor(intent.after).fits(sim, p, intent.after, phase, area),
  },

  leave: {
    to: (sim) => sim.world.spawn,
    start: (sim, p) => {
      sim.interrupt(p);
      p.hidden = true;
    },
    fits: () => true,
  },
};

/** The rules for an intent. */
export function rulesFor(intent: Intent): Rules<Intent> {
  return INTENTS[intent.kind] as Rules<Intent>;
}

/** Cooking takes from the pantry; the food shop fills the one at home. */
function eatFrom(sim: Simulation, p: Person, item: Item): void {
  const pantries = sim.world.pantries ?? {};
  // One kitchen cupboard per home, whichever floor the cooking's on.
  const home = sim.baseOf(item.level);
  const left = pantries[home];
  if (item.type.usesPantry && left !== undefined) pantries[home] = Math.max(0, left - item.type.usesPantry);
  if (item.type.groceries && p.home) {
    pantries[p.home] = PANTRY_FULL;
    sim.log(`${p.name} did the food shop 🛒`, [p.id]);
  }
}

/** Gaming on the sofa: fun, and company if someone else is playing in the same room. */
function game(sim: Simulation, p: Person, seat: Item, refill: Refill): void {
  refill(p, 'fun', GAMING.fun);
  const room = sim.roomOf(seat);
  const partner = sim.people.find(
    (q) => q !== p && q.level === p.level && q.intent?.kind === 'use' && q.intent.mode === 'games' && sim.roomOf(sim.items[q.intent.item]!) === room,
  );
  if (!partner) return;
  refill(p, 'social', GAMING.social);
  sim.social.together(p, partner, sim.dt / 2);
}
