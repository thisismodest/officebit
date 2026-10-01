// Children and their school days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import type { Simulation } from '../src/sim/sim.ts';
import { fresh, run, until, kindOf } from './town.ts';

test('children go to school on weekdays, have lunch there, and are in bed early', () => {
  const kids = (sim: Simulation) => sim.people.filter((p) => p.role === 'child');
  const sim = until(fresh(), 10);
  assert.ok(kids(sim).length > 0);
  for (const p of kids(sim)) assert.equal(kindOf(sim, p.id), 'school', `${p.name} is at school`);
  assert.equal(kindOf(sim, 'maggie'), 'school', 'the teacher is in');

  until(sim, 12.75);
  const lunch = kids(sim).filter((p) => p.intent?.kind === 'use' && sim.items[p.intent.item]?.def.t === 'canteenTable');
  assert.ok(lunch.length >= kids(sim).length / 2, 'most of them are at lunch');

  until(sim, 21);
  for (const p of kids(sim)) assert.equal(p.intent?.kind, 'sleep', `${p.name} is in bed`);

  run(sim, 4 * TICKS_PER_DAY); // Friday night, then Saturday morning
  until(sim, 11);
  // Off school: at home, or out with the family (a picnic in the park).
  for (const p of kids(sim)) assert.notEqual(kindOf(sim, p.id), 'school', `${p.name} is off school at the weekend`);
});
