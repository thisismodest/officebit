// Building work: crews, sites, nothing out of thin air.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh } from './town.ts';

test('construction: a crew walks in, builds, and leaves; nothing appears out of thin air', () => {
  const sim = fresh();
  const building = () => sim.levels.get('town')!.furniture.find((f) => f.t === 'startupSmall');
  let sawSite = false;
  let sawCrewOnSite = false;
  let sawBuildingBeforeSite = false;
  for (let t = 0; t < 20 * TICKS_PER_DAY && !(building() && sim.construction.jobs.length === 0); t++) {
    sim.step();
    const site = sim.activeItems().some((i) => i.type.worksite);
    sawSite ||= site;
    sawCrewOnSite ||= sim.people.some((p) => p.role === 'crew' && p.intent?.kind === 'use' && p.phase === 'doing');
    if (building() && !sawSite) sawBuildingBeforeSite = true;
  }
  assert.ok(sawSite, 'a building site went up first');
  assert.ok(sawCrewOnSite, 'a crew worked on it');
  assert.ok(!sawBuildingBeforeSite, 'the office never appeared without being built');
  assert.ok(building(), 'the office stands');
  assert.ok(sim.people.every((p) => p.role !== 'crew'), 'the crew has gone home');
  assert.deepEqual(validate(sim.world), []);
});
