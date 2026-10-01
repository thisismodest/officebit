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

  // Kept in its first office for the test, week by week (not growing into a bigger one while it's watched: no trading while the builders are in).
  venture.progress = 0;
  const before = staff().length;
  venture.funds = 3;
  pastFriday(sim);
  assert.ok(staff().length > before, 'doing well, it took someone on');

  const founder = sim.person(venture.founder)!;
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

  // The founder takes a break from ideas of their own (joining someone else's is fine).
  founder.ideas = 10;
  run(sim, 7 * TICKS_PER_DAY);
  assert.ok(sim.ventures.of(founder)?.founder !== founder.id, 'no new idea of their own yet');
  // The next venture to launch takes on the empty office: whoever's.
  // Someone else catches the bug: ambitious all of a sudden, with an idea ready to go, and an evening's work on it.
  // (Not one of the team that closed: they're taking a break from ideas.)
  const maker = sim.people.find((p) => !p.npc && p.home && !p.venture && !team.includes(p.id) && p.company && !sim.ventures.isVenture(p.company))!;
  maker.traits.ambition = 0.9;
  maker.ideas = 10;
  sim.ventures.hustled(maker);
  assert.equal(sim.ventures.of(maker)?.founder, maker.id, `${maker.name} started something`);
  sim.ventures.of(maker)!.progress = 60;
  const tenant = () => sim.ventures.list.find((v) => sim.companies.get(v.id)?.levels.includes(office));
  assert.ok(runUntil(sim, 7, () => !!tenant()), 'someone moved into the empty office');
  const next = tenant()!;
  assert.ok(next.stage === 'launched' || next.stage === 'grown', 'straight in, no builders');
  assert.deepEqual(next.site, site, 'on its lot');
  assert.ok(sim.levels.get(site.level)!.furniture.some((f) => f.label === next.name), 'its name over the door');
  assert.deepEqual(validate(sim.world), []);
});
