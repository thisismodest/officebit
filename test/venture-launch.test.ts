// A venture from idea to its own office.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh, runUntil, startVenture } from './town.ts';

test('ventures: an idea becomes a company with its own office, and the world stays valid', () => {
  const sim = fresh();
  const founder = sim.person('mo')!;
  const venture = startVenture(sim, founder);
  assert.ok(runUntil(sim, TICKS_PER_DAY, () => venture.stage !== 'side'), 'launched that evening');
  assert.ok(sim.companies.has(venture.id), 'it is a company');
  assert.equal(founder.company, venture.id, 'the founder quit their day job');
  assert.ok(runUntil(sim, 14 * TICKS_PER_DAY, () => venture.stage === 'launched'), 'into its office once the crew are done');
  assert.ok(sim.levels.has(`${venture.id}-office`), 'it has an office');
  assert.ok(sim.levels.get('town')!.furniture.some((f) => f.label?.startsWith(venture.name)), 'its building stands in town');
  assert.deepEqual(validate(sim.world), []);
});
