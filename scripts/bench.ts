// How fast the sim runs (docs/DEVELOPING.md#speed): the starter town, filled
// out to a given number of people (sharing its homes and workplaces), run
// headless for a few days.   npm run bench -- [people] [days]
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { STARTER } from '../src/worlds/starter.ts';

const people = Number(process.argv[2] ?? 200);
const days = Number(process.argv[3] ?? 2);
const PRESETS = ['regular', 'workhorse', 'magnet', 'introvert', 'distractor'];

/** The starter world with extra townsfolk, round-robin across its homes and employers. */
export function crowded(size: number): WorldDef {
  const world = structuredClone(STARTER);
  const homes = world.levels.filter((l) => l.kind === 'home').map((l) => l.id);
  const companies = world.companies.map((c) => c.id);
  const extra = size - world.people.length - world.npcs.length;
  for (let i = 0; i < extra; i++) {
    world.people.push({
      id: `extra-${i}`,
      name: `Extra ${i}`,
      look: [i % 5, i % 7, i % 8, i % 3],
      preset: PRESETS[i % PRESETS.length],
      home: homes[i % homes.length],
      company: companies[i % companies.length],
    });
  }
  return world;
}

const sim = new Simulation(crowded(people));
const started = performance.now();
while (sim.tick < days * TICKS_PER_DAY) sim.step();
const ms = performance.now() - started;
console.log(`${sim.people.length} people, ${days} days: ${Math.round(ms)} ms (${Math.round(ms / days)} ms a day, ${((ms * 1000) / (days * TICKS_PER_DAY)).toFixed(0)} µs a step)`);
