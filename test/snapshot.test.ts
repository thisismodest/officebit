import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { restore, shapeOf, snapshot } from '../src/sim/snapshot.ts';
import type { Simulation } from '../src/sim/sim.ts';
import { fresh, run } from './town.ts';

const story = (sim: Simulation) =>
  JSON.stringify([sim.tick, sim.people.map((p) => [p.id, p.level, p.x, p.y, p.intent, p.needs]), sim.traffic.cars.map((c) => [c.id, c.x, c.y]), sim.events.slice(-50)]);

test('a town saved and restored carries on with exactly the same story', () => {
  const sim = run(fresh(), 3 * TICKS_PER_DAY + 8 * TICKS_PER_HOUR);
  const copy = restore(structuredClone(snapshot(sim)));
  assert.equal(copy.tick, sim.tick);
  for (let i = 0; i < 4; i++) {
    run(sim, TICKS_PER_HOUR);
    run(copy, TICKS_PER_HOUR);
    assert.equal(story(copy), story(sim), `the same an hour on, ${i + 1} times`);
  }
});

test('a snapshot only fits a sim of the same shape: a fresh one matches one that has run, and one missing a part does not', () => {
  const sim = run(fresh(), TICKS_PER_DAY);
  const snap = snapshot(sim);
  assert.equal(snap.shape, shapeOf(fresh()), 'a fresh town and one a day on are the same shape');
  const older = run(fresh(), 1) as unknown as Record<string, unknown>;
  delete older.parcels;
  assert.notEqual(shapeOf(older as never), snap.shape, 'a build without the parcels is another shape');
});
