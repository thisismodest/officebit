import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR, dayOf, hourOf } from '../src/sim/clock.ts';
import type { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import { fresh, run, runUntil, startVenture } from './town.ts';

/** On to the end of the next Friday's takings (17:00, and an hour to be sure). */
const pastFriday = (sim: Simulation) => {
  do run(sim, TICKS_PER_HOUR);
  while (!(dayOf(sim.tick) % 7 === 4 && Math.floor(hourOf(sim.tick)) === 18));
};

test('ventures: doing well, they hire; out of money, they close, their people look for work, and the office is taken on by the next', () => {
  const sim = fresh();
  const founder = sim.person('mo')!;
  const venture = startVenture(sim, founder);
  assert.ok(runUntil(sim, 14 * TICKS_PER_DAY, () => venture.stage === 'launched'), 'a venture has its office');
  const staff = () => sim.people.filter((p) => p.company === venture.id);

  // Kept in its first office for the test, week by week (not growing into a bigger one while it's watched: no trading while the builders are in).
  venture.progress = 0;
  const before = staff().length;
  venture.funds = 3;
  pastFriday(sim);
  assert.ok(staff().length > before, 'doing well, it took someone on');

  const dayJob = founder.formerCompany;
  assert.ok(dayJob && sim.companies.has(dayJob), 'the founder walked out of a job they might get back');
  const site = venture.site!;
  const office = `${venture.stem}-office`;
  venture.progress = 0;
  venture.funds = -10;
  const team = [...venture.members];
  pastFriday(sim);
  assert.ok(!sim.ventures.list.includes(venture), 'it closed');
  assert.ok(!sim.companies.has(venture.id), 'nobody works there any more');
  assert.ok(!founder.company || !sim.ventures.isVenture(founder.company), 'the founder is looking for work, or has found some');
  assert.equal(founder.venture, undefined);
  assert.ok(sim.levels.has(office), 'the office still stands');
  assert.ok(sim.levels.get(site.level)!.furniture.some((f) => f.label === 'To let'), 'to let');
  assert.deepEqual(validate(sim.world), []);

  // The founder takes a break from ideas of their own (joining someone else's is fine): an evening's tinkering comes to nothing.
  founder.ideas = 10;
  sim.ventures.hustled(founder);
  assert.equal(sim.ventures.of(founder), undefined, 'no new idea of their own yet');
  // The next venture to launch takes on the empty office: whoever's (not anyone whose venture closed).
  const maker = sim.people.find((p) => !p.npc && p.home && !p.venture && !team.includes(p.id) && p.company && !sim.ventures.isVenture(p.company))!;
  const next = startVenture(sim, maker);
  assert.equal(next.founder, maker.id, `${maker.name} started something`);
  const tenant = () => sim.ventures.list.find((v) => sim.companies.get(v.id)?.levels.includes(office));
  assert.ok(runUntil(sim, 7 * TICKS_PER_DAY, () => !!tenant()), 'someone moved into the empty office');
  assert.equal(tenant(), next);
  assert.ok(next.stage === 'launched' || next.stage === 'grown', 'straight in, no builders');
  assert.deepEqual(next.site, site, 'on its lot');
  assert.ok(sim.levels.get(site.level)!.furniture.some((f) => f.label === next.name), 'its name over the door');
  assert.deepEqual(validate(sim.world), []);
});
