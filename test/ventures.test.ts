import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR, dayOf, hourOf } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { STARTER } from '../src/worlds/starter.ts';

const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
  return sim;
};
/** On to the end of the next Friday's takings (17:00, and an hour to be sure). */
const pastFriday = (sim: Simulation) => {
  do run(sim, TICKS_PER_HOUR);
  while (!(dayOf(sim.tick) % 7 === 4 && Math.floor(hourOf(sim.tick)) === 18));
};
/** Run a day at a time (at most `days`) until `done`. */
const runUntil = (sim: Simulation, days: number, done: () => boolean) => {
  for (let day = 0; day < days && !done(); day++) run(sim, TICKS_PER_DAY);
  return done();
};

test('ventures: doing well, they hire; out of money, they close, their people look for work, and the office is taken on by the next', () => {
  const sim = run(new Simulation(structuredClone(STARTER)), 12 * TICKS_PER_DAY);
  const venture = sim.ventures.list.find((v) => v.stage === 'launched');
  assert.ok(venture, 'a venture has its office');
  const staff = () => sim.people.filter((p) => p.company === venture.id);

  const before = staff().length;
  venture.funds = 3;
  pastFriday(sim);
  assert.ok(staff().length > before, 'doing well, it took someone on');

  const founder = sim.person(venture.founder)!;
  const dayJob = founder.formerCompany;
  assert.ok(dayJob && sim.companies.has(dayJob), 'the founder walked out of a job they might get back');
  const site = venture.site!;
  const office = `${venture.stem}-office`;
  venture.funds = -10;
  pastFriday(sim);
  assert.ok(!sim.ventures.list.includes(venture), 'it closed');
  assert.ok(!sim.companies.has(venture.id), 'nobody works there any more');
  assert.ok(!founder.company || !sim.ventures.isVenture(founder.company), 'the founder is looking for work, or has found some');
  assert.equal(founder.venture, undefined);
  assert.ok(sim.levels.has(office), 'the office still stands');
  assert.ok(sim.levels.get(site.level)!.furniture.some((f) => f.label === 'To let'), 'to let');
  assert.deepEqual(validate(sim.world), []);

  // After a break, the founder's next idea launches into the empty office.
  founder.ideas = 10;
  run(sim, 7 * TICKS_PER_DAY);
  assert.equal(founder.venture, undefined, 'looking for work first');
  assert.ok(runUntil(sim, 14, () => !!founder.venture), 'the founder tried again');
  const next = sim.ventures.of(founder)!;
  next.progress = 60;
  assert.ok(runUntil(sim, 7, () => next.stage !== 'side'), `${next.name} launched`);
  assert.deepEqual(next.site, site, 'on the same lot');
  assert.deepEqual(sim.companies.get(next.id)?.levels, [office], 'in the empty office');
  assert.ok(sim.levels.get(site.level)!.furniture.some((f) => f.label === next.name), 'its name over the door');
  assert.equal(founder.company, next.id);
  assert.deepEqual(validate(sim.world), []);
});
