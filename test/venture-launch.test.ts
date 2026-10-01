// A venture from idea to its own office.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh, run } from './town.ts';

test('ventures: an idea becomes a company with its own office, and the world stays valid', () => {
  const sim = run(fresh(), 30 * TICKS_PER_DAY);
  const [venture] = sim.ventures.list;
  assert.ok(venture, 'someone ambitious started something');
  assert.notEqual(venture.stage, 'side', `${venture.name} should have launched`);
  assert.ok(sim.companies.has(venture.id), 'it is a company');
  assert.ok(sim.levels.has(`${venture.id}-office`), 'it has an office (even if the builders are in again)');
  const founder = sim.person(venture.founder)!;
  assert.equal(founder.company, venture.id, 'the founder quit their day job');
  assert.ok(sim.levels.get('town')!.furniture.some((f) => f.label?.startsWith(venture.name)), 'its building (or building site) stands in town');
  assert.deepEqual(validate(sim.world), []);
});
