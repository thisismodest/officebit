// Building work: crews, sites, nothing out of thin air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh, runUntil } from './town.ts';

test('construction: a crew walks in, builds, and leaves; nothing appears out of thin air', () => {
  const sim = fresh();
  // Something new to put up (as a release brings older towns), from the first morning.
  const { year, month, day } = sim.dateOf(0);
  sim.world.works = [{ version: '9.0.0', from: [year, month, day, 6], level: 'town', furniture: { t: 'billboard', p: [60, 50] } }];
  const built = () => sim.activeItems().some((i) => i.def.t === 'billboard' && i.def.p.join() === '60,50');
  let sawSite = false;
  let sawCrewOnSite = false;
  let sawBuiltBeforeSite = false;
  const done = runUntil(sim, 3 * TICKS_PER_DAY, () => {
    sawSite ||= sim.activeItems().some((i) => i.type.worksite);
    sawCrewOnSite ||= sim.people.some((p) => p.role === 'crew' && p.intent?.kind === 'use' && p.phase === 'doing');
    if (built() && !sawSite) sawBuiltBeforeSite = true;
    return built() && sim.construction.jobs.length === 0 && sim.people.every((p) => p.role !== 'crew');
  });
  assert.ok(sawSite, 'a building site went up first');
  assert.ok(sawCrewOnSite, 'a crew worked on it');
  assert.ok(!sawBuiltBeforeSite, 'it never appeared without being built');
  assert.ok(done, 'it stands, and the crew has gone home');
  assert.deepEqual(validate(sim.world), []);
});
