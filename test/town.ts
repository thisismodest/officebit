// Shared test helpers: a fresh test town (or the starter town, for tests about it), running it on, and setting up a
// moment to test (not a test file: node --test runs *.test.ts). See docs/DEVELOPING.md#testing.
import { DEFAULT_CALENDAR, type Calendar } from '../src/sim/calendar.ts';
import { TICKS_PER_HOUR, hourOf, tickAt } from '../src/sim/clock.ts';
import type { Person } from '../src/sim/person.ts';
import { IDEA_HOURS, LAUNCH_HOURS } from '../src/sim/ventures.ts';
import { Simulation } from '../src/sim/sim.ts';
import type { Tile, WorldDef } from '../src/sim/world.ts';
import { buildWorld } from '../src/worlds/build.ts';
import { STARTER } from '../src/worlds/starter.ts';
import { TEST_TOWN_CONFIG } from './town.config.ts';

/** The compact test town, as a world. */
export const TEST_TOWN: WorldDef = buildWorld(TEST_TOWN_CONFIG);

/** A fresh test town (patched, if you like: another seed, love off). */
export const fresh = (patch: Partial<WorldDef> = {}) => new Simulation({ ...structuredClone(TEST_TOWN), ...patch });
/** A fresh starter town, for tests about the town that ships. */
export const starter = (patch: Partial<WorldDef> = {}) => new Simulation({ ...structuredClone(STARTER), ...patch });
/** A test town whose first day (a Monday, tick 0) is this date. */
export const freshFrom = (start: Calendar['start']) => {
  const sim = fresh();
  sim.calendar = { ...DEFAULT_CALENDAR, start };
  return sim;
};

export const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
  return sim;
};
/** Run until the clock reads `hour` (on the current or next day). */
export const until = (sim: Simulation, hour: number) => run(sim, Math.round(((hour - hourOf(sim.tick) + 24) % 24) * TICKS_PER_HOUR));
/** Run to `hour` on story day `day` (0 is the first). */
export const untilDay = (sim: Simulation, day: number, hour: number) => {
  const to = tickAt(day, hour);
  while (sim.tick < to) sim.step();
  return sim;
};
/** Run a step at a time (at most `ticks`) until `done`; whether it came about. */
export const runUntil = (sim: Simulation, ticks: number, done: () => boolean) => {
  for (let t = 0; t < ticks && !done(); t++) sim.step();
  return done();
};

export const kindOf = (sim: Simulation, id: string) => sim.levels.get(sim.person(id)!.level)!.kind;
export const snapshot = (sim: Simulation) => sim.people.map((p) => [p.id, p.level, p.x, p.y, p.intent?.kind]);
/** Where something stands on a town's map (the test town's, unless you say), by its label or catalog type. */
export const onMap = (labelOrType: string, world: WorldDef = TEST_TOWN): Tile => world.levels[0]!.furniture.find((f) => f.label === labelOrType || f.t === labelOrType)!.p;
/** The tile in front of the door into a level, on the town map. */
export const doorInto = (level: string, world: WorldDef = TEST_TOWN): Tile => world.portals.find((p) => p.b.level === level && p.a.level === 'town')!.a.p;
export const employees = (sim: Simulation) => sim.people.filter((p) => !p.npc);

/** Two people the best of friends (as if they'd spent months together). */
export const befriend = (sim: Simulation, a: Person, b: Person) => {
  for (let i = 0; i < 20; i++) sim.relationships.together(a, b, 1000, 2);
};

/** Someone's side project, ready to launch: ambitious, an idea, and the evenings' work done. */
export const startVenture = (sim: Simulation, founder: Person) => {
  founder.traits.ambition = 0.9;
  founder.ideas = IDEA_HOURS;
  sim.ventures.hustled(founder);
  const venture = sim.ventures.of(founder)!;
  venture.progress = LAUNCH_HOURS;
  return venture;
};
