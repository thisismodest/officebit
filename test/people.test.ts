import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG } from '../src/sim/catalog.ts';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { addFamily, addPerson, giveJob, letGo, planFamily, removePerson, updatePerson, type NewFamily } from '../src/worlds/edit.ts';
import { STARTER } from '../src/worlds/starter.ts';

const world = (): WorldDef => structuredClone(STARTER);
const run = (sim: Simulation, ticks: number) => {
  for (let t = 0; t < ticks; t++) sim.step();
  return sim;
};

test('a baby needs a free bed, and gets a desk at school', () => {
  const w = world();
  assert.match(planFamily(w, 'home-rowan', 'child', 'Pip') as string, /no bed free/);
  const plan = planFamily(w, 'home-ines', 'child', 'Pip') as NewFamily;
  assert.equal(plan.def.role, 'child');
  assert.ok(plan.desk, 'a school desk');
  addFamily(w, plan);
  assert.ok(w.npcs.some((n) => n.id === plan.def.id));
  assert.deepEqual(validate(w), []);
  // And a pet needs somewhere to curl up; most homes have a sofa.
  assert.equal(typeof planFamily(w, 'home-ines', 'pet', 'Mog'), 'object');
});

test('a baby is dropped off by car, crawls home, and settles in', () => {
  const sim = new Simulation(world());
  const plan = planFamily(sim.world, 'home-ines', 'child', 'Pip') as NewFamily;
  const desk = sim.activeItems().find((i) => i.def.t === 'schoolDesk' && i.def.p[0] === plan.desk!.p[0] && i.def.p[1] === plan.desk!.p[1])!;
  desk.def.owner = plan.def.id;
  sim.arrivals.welcome(structuredClone(plan.def), true);
  assert.equal(sim.person('pip'), undefined, 'not until the car gets there');
  let crawled = false;
  for (let t = 0; t < TICKS_PER_DAY && !(crawled && sim.person('pip')?.level === 'home-ines'); t++) {
    sim.step();
    crawled ||= !!sim.person('pip')?.crawling;
  }
  sim.step();
  const pip = sim.person('pip')!;
  assert.ok(crawled, 'crawled from the car');
  assert.equal(pip.level, 'home-ines');
  assert.ok(!pip.crawling);
  assert.ok(sim.historyOf('pip').some((e) => /car dropped Pip off/.test(e.text)));
  run(sim, TICKS_PER_DAY);
  assert.equal(sim.arrivals.pending, 0, 'and the car has gone');
  assert.deepEqual(validate(sim.world), []);
});

test('leaving town: the household walks off, and the home goes up to let', () => {
  const sim = new Simulation(world());
  const rowan = sim.person('rowan')!;
  const household = sim.people.filter((p) => p.home === 'home-rowan').map((p) => p.id);
  sim.leaveTown(rowan);
  run(sim, TICKS_PER_DAY);
  assert.deepEqual(household.filter((id) => sim.person(id)), [], 'all gone');
  assert.equal(sim.levels.get('home-rowan')!.name, 'To let');
  assert.ok(!sim.items.some((i) => i.def.owner === 'rowan'), 'nothing of theirs left');
  assert.deepEqual(validate(sim.world), []);
  // The design, likewise.
  const w = world();
  assert.equal(removePerson(w, 'rowan'), null);
  assert.ok(!w.npcs.some((n) => n.home === 'home-rowan'));
  assert.deepEqual(validate(w), []);
});

test('the last one at home moving out takes the pets with them, so a house to let is empty', () => {
  const sim = new Simulation(world());
  const mo = sim.person('mo')!;
  const plan = planFamily(sim.world, mo.home!, 'pet', 'Tibbs') as NewFamily;
  sim.arrivals.welcome(plan.def, false);
  run(sim, 600);
  sim.moveOut(mo);
  run(sim, TICKS_PER_DAY);
  assert.equal(sim.person('tibbs'), undefined, 'the cat went too');
  assert.ok(sim.housing.vacant().some((h) => h.level.id === 'home-mo'), 'and it really is to let');
});

test('editing someone: a new name renames their house; a new personality changes their days', () => {
  const sim = new Simulation(world());
  const ines = sim.person('ines')!;
  const before = { ...ines.routine };
  sim.editPerson(ines, { name: 'Inez', preset: 'founder', look: [4, 6, 7, 1] });
  assert.equal(ines.name, 'Inez');
  assert.equal(sim.levels.get('home-ines')!.name, "Inez's house");
  assert.equal(ines.preset, 'founder');
  assert.notDeepEqual(ines.routine, before);
  assert.deepEqual(sim.defOf('ines')!.look, [4, 6, 7, 1]);
  const w = world();
  assert.equal(updatePerson(w, 'miso', { name: 'Mochi', look: [3] }), null, 'pets too');
  assert.equal(w.npcs.find((n) => n.id === 'miso')!.name, 'Mochi');
  assert.equal(letGo(w, 'ines'), null);
  assert.equal(w.people.find((p) => p.id === 'ines')!.company, '', 'out of work');
  assert.equal(new Simulation(w).person('ines')!.company, undefined, 'and so they start out');
  assert.ok(!w.levels.some((l) => l.furniture.some((f) => f.owner === 'ines' && CATALOG[f.t]?.desk)), 'their desk is free');
  // And back again, with a desk of their own.
  assert.equal(giveJob(w, 'ines', 'head'), null);
  const back = new Simulation(w).person('ines')!;
  assert.equal(back.company, 'head');
  assert.ok(back.desk >= 0, 'at a desk');
  assert.deepEqual(validate(w), []);
});

test('someone new to the team walks in from the edge of town, to a house to let that takes their name, with a desk at work', () => {
  const sim = new Simulation(world());
  const design = world();
  const { id } = addPerson(design, { name: 'Zara', dept: 'Sound', company: 'head' });
  const def = structuredClone(design.people.find((p) => p.id === id)!);
  sim.addDepartment(design.departments.find((d) => d.id === def.dept)!);
  const desk = sim.activeItems().find((i) => i.type.desk && !i.def.owner && sim.companies.get('head')!.levels.includes(i.level))!;
  desk.def.owner = id;
  const zara = sim.arrivals.newStarter(def);
  assert.deepEqual([zara.level, zara.x, zara.y], [sim.world.spawn.level, ...sim.world.spawn.p], 'at the edge of town');
  assert.equal(sim.levels.get(zara.home!)!.name, "Zara's house");
  let home = false;
  let work = false;
  for (let t = 0; t < TICKS_PER_DAY * 2; t++) {
    sim.step();
    home ||= zara.level === zara.home;
    work ||= home && sim.companies.get('head')!.levels.includes(zara.level);
  }
  assert.ok(home, 'home first, to settle in');
  assert.ok(work, 'then off to work');
  assert.deepEqual(validate(sim.world), []);
});

test('a birthday: in the News, a cheerier day and a party hat; a cake brought in to work that colleagues share, cleared away after', () => {
  const sim = new Simulation(world());
  const { month, day } = sim.dateOf(0);
  const ines = sim.person('ines')!;
  sim.defOf('ines')!.birthday = [month, day];
  ines.needs.fun = 0.2;
  sim.step();
  assert.ok(sim.birthdays.is(ines), 'her birthday today');
  assert.ok(ines.needs.fun > 0.45, 'a bit more cheerful');
  assert.ok(sim.historyOf('ines').some((e) => /It's Ines's birthday/.test(e.text)));
  let cake: { uses: number; gone?: boolean } | undefined;
  let slices = 0;
  for (let t = 0; t < TICKS_PER_DAY - 2; t++) {
    sim.step();
    cake ??= sim.activeItems().find((i) => i.def.t === 'birthdayCake');
    if (cake) slices = Math.max(slices, cake.uses);
  }
  assert.ok(cake, 'a cake came in');
  assert.ok(slices >= 2, `${slices} slices eaten`);
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'birthdayCake'), 'and it was cleared away');
  sim.step();
  sim.step();
  assert.ok(!sim.birthdays.is(ines), 'and the next day is just a day');
  assert.deepEqual(validate(sim.world), []);
});
