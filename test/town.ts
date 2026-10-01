// Shared test helpers: a fresh starter town, and running it on (not a test file: node --test runs *.test.ts).
import { TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { STARTER } from '../src/worlds/starter.ts';

export const fresh = (patch: Partial<WorldDef> = {}) => new Simulation({ ...structuredClone(STARTER), ...patch });
export const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
  return sim;
};
/** Run until the clock reads `hour` (on the current or next day). */
export const until = (sim: Simulation, hour: number) => run(sim, Math.round(((hour - hourOf(sim.tick) + 24) % 24) * TICKS_PER_HOUR));
export const kindOf = (sim: Simulation, id: string) => sim.levels.get(sim.person(id)!.level)!.kind;
export const snapshot = (sim: Simulation) => sim.people.map((p) => [p.id, p.level, p.x, p.y, p.intent?.kind]);
export const employees = (sim: Simulation) => sim.people.filter((p) => !p.npc);
