import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR, tickAt } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { vehicleAt } from '../src/sim/food-trucks.ts';
import { validate } from '../src/sim/validate.ts';
import { STARTER } from '../src/worlds/starter.ts';
import { TEST_TOWN, fresh, run, until, snapshot, employees } from './town.ts';

test('the starter world is valid', () => {
  assert.deepEqual(validate(STARTER), []);
});

test('the test town is valid', () => {
  assert.deepEqual(validate(TEST_TOWN), []);
});

test('the same world replays identically', () => {
  const a = run(fresh(), 3000);
  const b = run(fresh(), 3000);
  assert.deepEqual(snapshot(a), snapshot(b));
  assert.deepEqual(a.events, b.events);
});

test('a different seed tells a different story', () => {
  assert.notDeepEqual(snapshot(run(fresh(), 3000)), snapshot(run(fresh({ seed: 7 }), 3000)));
});

test('nobody ever stands inside a wall or furniture', () => {
  const sim = fresh();
  for (let i = 0; i < 24 * TICKS_PER_HOUR; i += 1) {
    sim.step();
    if (i % 5) continue;
    for (const p of sim.people) {
      // Aboard something (the bus, a boat on the river), they're where it is.
      if (p.riding) continue;
      const grid = sim.grids.get(p.level)!;
      // Mid-step positions sit between two walkable tiles, so check both.
      for (const [x, y] of [[Math.floor(p.x), Math.floor(p.y)], [Math.ceil(p.x), Math.ceil(p.y)]] as const) {
        assert.ok(grid.walkable(x, y), `${p.name} at ${p.level} ${p.x},${p.y} on tick ${sim.tick}`);
      }
    }
  }
});

test('a day: asleep at home at night, at the office by late morning', () => {
  const sim = until(fresh(), 3);
  for (const p of sim.people.filter((q) => q.home && q.role !== 'staff')) assert.equal(sim.levels.get(p.level)!.kind, 'home', `${p.name} should be home at 03:00`);
  // Everyone on office hours, that is: Juno works the shop's late shift and isn't in bed yet.
  assert.ok(employees(sim).filter((p) => !p.shift).every((p) => p.intent?.kind === 'sleep'), 'everyone asleep at 03:00');

  until(sim, 11);
  // Everyone due by then (Juno's shift starts at noon); one may be late, or stretching a swim into the morning.
  const due = employees(sim).filter((p) => !p.shift || p.shift[0] <= 11);
  const atWork = due.filter((p) => sim.companies.get(p.company ?? '')?.levels.includes(p.level));
  assert.ok(atWork.length >= due.length - 1, `only ${atWork.length} of ${due.length} at work at 11:00`);
  assert.ok(sim.events.some((e) => e.text.endsWith('arrived at Head office')));
});

test('people use the stairs', () => {
  const sim = until(fresh(), 11);
  const floors = new Set(employees(sim).map((p) => p.level));
  assert.ok(floors.has('ground') && floors.has('first'), `people on ${[...floors].join(', ')}`);
});

test('family and pets stay home', () => {
  const sim = fresh();
  // (Unless they're out with friends, or on their way back: a plan takes anyone along.)
  const planned = new Set<string>();
  for (let h = 0; h < 24; h++) {
    for (let t = 0; t < TICKS_PER_HOUR; t++) {
      sim.step();
      for (const p of sim.people) if (p.plan !== undefined) planned.add(p.id);
    }
    for (const p of sim.people.filter((q) => q.npc && !q.role && !planned.has(q.id))) assert.equal(p.level, p.home, `${p.name} left home`);
  }
});

test('personalities show up in behaviour', () => {
  const sim = until(fresh(), 18);
  const by = (id: string) => sim.person(id)!;
  assert.ok(by('theo').stats.interruptions + by('cal').stats.interruptions > 0, 'distractors interrupt people');
  assert.ok(by('hana').stats.work > by('cal').stats.work, 'the workhorse out-works the distractor');
});

test('people without a home come and go via the spawn point', () => {
  const world = structuredClone(TEST_TOWN);
  world.people[0]!.home = undefined;
  const sim = until(new Simulation(world), 3);
  assert.equal(sim.person(world.people[0]!.id)!.hidden, true);
  until(sim, 11);
  assert.equal(sim.person(world.people[0]!.id)!.hidden, false);
});

test('weekends: nobody goes to work on Saturday', () => {
  // Straight to Saturday morning, everyone in bed.
  const sim = fresh();
  sim.tick = tickAt(5, 0);
  until(sim, 11);
  assert.ok(employees(sim).every((p) => sim.levels.get(p.level)!.kind !== 'building'), 'the office should be empty on Saturday');
});

test('food trucks: open for weekday lunch, and people pop out to them', () => {
  const sim = fresh();
  const trucks = sim.activeItems().filter((i) => i.type.street);
  let visits = 0;
  for (let day = 0; day < 2; day++) {
    until(sim, 11.9);
    assert.ok(trucks.every((t) => !sim.isOpen(t)), 'closed before noon');
    for (let t = 0; t < 2 * TICKS_PER_HOUR; t++) {
      sim.step();
      visits += sim.people.filter((p) => p.intent?.kind === 'use' && sim.items[p.intent.item]!.type.street && p.phase === 'doing').length;
    }
    until(sim, 15);
    assert.ok(trucks.every((t) => !sim.isOpen(t)), 'gone by the afternoon');
  }
  assert.ok(visits > 0, 'someone had lunch from a truck');
});

test('evenings: some people play video games at home', () => {
  const sim = until(fresh(), 17);
  let gaming = 0;
  for (let t = 0; t < 6 * TICKS_PER_HOUR; t++) {
    sim.step();
    gaming += sim.people.filter((p) => p.intent?.kind === 'use' && p.intent.mode === 'games' && p.phase === 'doing').length;
  }
  assert.ok(gaming > 0);
});

test('food trucks drive in on the roads before lunch, pull onto their pitch, serve only once parked, and drive off afterwards', () => {
  const sim = fresh();
  const [truck] = sim.activeItems().filter((i) => i.type.street);
  const level = sim.levels.get(truck!.level)!;
  const grid = sim.grids.get(truck!.level)!;
  const floor = (x: number, y: number) => level.rooms[grid.roomAt(Math.round(x), Math.round(y))]?.floor;
  until(sim, 10);
  assert.equal(vehicleAt(sim, truck!), null, 'not in town mid-morning');
  until(sim, 11.1);
  assert.ok(vehicleAt(sim, truck!)?.moving, 'on its way in before noon');
  assert.ok(!sim.isOpen(truck!), 'and not serving yet');
  // On the road (or the highway) all the way, its middle in a lane, until it pulls off onto the pitch.
  const [px, py] = truck!.def.p;
  let offRoad = 0;
  while (vehicleAt(sim, truck!)?.moving) {
    sim.step();
    const pose = vehicleAt(sim, truck!);
    // Pulling up onto the pitch: just over the pavement, straight off the road in front.
    const near = pose && Math.abs(pose.x - px) <= 2 && pose.y >= py && pose.y <= py + 3;
    if (pose && !near && !['road', 'highway', 'zebra', 'zebraSide', 'bridge', 'bridgeSide', undefined].includes(floor(pose.x + pose.middle[0], pose.y + pose.middle[1]))) offRoad++;
  }
  assert.equal(offRoad, 0, 'never off the road on the way');
  until(sim, 12.5);
  const parked = vehicleAt(sim, truck!)!;
  assert.deepEqual([parked.x, parked.y, parked.facing, parked.moving], [px, py, 'up', false]);
  assert.ok(sim.isOpen(truck!), 'serving');
  until(sim, 14.1);
  assert.ok(vehicleAt(sim, truck!)?.moving, 'driving off after lunch');
  until(sim, 15.5);
  assert.equal(vehicleAt(sim, truck!), null, 'gone by mid-afternoon');
});

test('careers: leaving frees a desk; the let-go find work somewhere else, and the walked-out can be taken back', () => {
  const sim = until(fresh(), 8);
  const cal = sim.person('cal')!;
  const sam = sim.person('sam')!;
  sim.careers.leave(cal, 'fired');
  sim.careers.leave(sam, 'quit');
  assert.equal(cal.company, undefined);
  assert.equal(cal.desk, -1);
  // A 50% chance each weekday: three weeks is plenty.
  for (let day = 0; day < 21 && (!cal.company || !sam.company); day++) run(sim, TICKS_PER_DAY);
  assert.ok(cal.company && cal.company !== 'head', `the let-go work somewhere else now (${cal.company})`);
  assert.equal(sam.company, 'head', 'the walked-out can be taken back');
  assert.deepEqual(validate(sim.world), []);
});

test("looking at someone's thoughts doesn't change the story", async () => {
  const { PersonalityBrain } = await import('../src/sim/brain.ts');
  const brain = new PersonalityBrain();
  const watched = fresh();
  const unwatched = fresh();
  for (let t = 0; t < 2000; t++) {
    watched.step();
    unwatched.step();
    if (t % 50 === 0) for (const p of watched.people) watched.peek(() => brain.options(p, watched));
  }
  assert.deepEqual(snapshot(watched), snapshot(unwatched));
});

test('everyone keeps their own history of what happened to them', () => {
  const sim = run(fresh(), TICKS_PER_DAY);
  const involved = sim.events.filter((e) => e.who.length > 0);
  assert.ok(involved.length > 0, 'events name who was involved');
  for (const event of involved) {
    // Anyone still in town, that is: visitors take their memories with them.
    for (const id of event.who.filter((id) => sim.person(id))) assert.ok(sim.historyOf(id).includes(event), `${id} remembers "${event.text}"`);
  }
  const [a, b] = involved.find((e) => e.who.length >= 2)?.who ?? [];
  if (a && b) assert.ok(sim.historyOf(b).some((e) => e.who.includes(a)), 'both sides of an encounter remember it');
});

test('relationships: fixed compatibility, households start close, interruptions sour things', () => {
  const sim = fresh();
  const [rowan, jules, theo, ines] = ['rowan', 'jules', 'theo', 'ines'].map((id) => sim.person(id)!);
  const r = sim.relationships;
  assert.equal(r.compatibility(theo!, ines!), r.compatibility(ines!, theo!), 'the same both ways');
  assert.equal(r.compatibility(theo!, ines!), fresh().relationships.compatibility(fresh().person('theo')!, fresh().person('ines')!), 'the same every time');
  assert.ok(sim.affinity(rowan!, jules!) >= 0.5, 'partners start close');
  const before = sim.affinity(theo!, ines!);
  r.interrupted(theo!, ines!);
  assert.ok(sim.affinity(theo!, ines!) < before);
});

test("relationships: people keep away from someone they can't stand", async () => {
  const { PersonalityBrain } = await import('../src/sim/brain.ts');
  const sim = until(fresh(), 12);
  const [a, b] = ['bea', 'cal'].map((id) => sim.person(id)!);
  const chatWith = () => new PersonalityBrain().options(a!, sim).find((o) => o.intent.kind === 'chat' && o.intent.with === b!.id)?.score ?? -Infinity;
  // Somewhere they're both about (a chat's an option at all).
  for (let t = 0; t < TICKS_PER_DAY && chatWith() === -Infinity; t++) sim.step();
  const liked = chatWith();
  assert.ok(liked > -Infinity, 'a chat was on the cards');
  for (let i = 0; i < 40; i++) sim.relationships.interrupted(b!, a!);
  assert.ok(sim.affinity(a!, b!) <= -0.3);
  assert.ok(chatWith() < liked - 0.5, 'far less keen to chat');
});

test('gamers seek out the arcade machines, and play them most', () => {
  const sim = fresh();
  const goes = new Map<string, number>();
  const last = new Map<string, number>();
  for (let t = 0; t < 4 * TICKS_PER_DAY; t++) {
    sim.step();
    for (const p of sim.people) {
      const i = p.intent?.kind === 'use' ? p.intent.item : -1;
      if (i >= 0 && sim.items[i]!.def.t === 'arcade' && last.get(p.id) !== i) goes.set(p.id, (goes.get(p.id) ?? 0) + 1);
      last.set(p.id, i);
    }
  }
  const gamer = (id: string) => {
    const t = sim.person(id)!.traits;
    return (t.chaos + (1 - t.diligence)) / 2 > 0.35;
  };
  const total = (which: boolean) => [...goes].filter(([id]) => gamer(id) === which).reduce((sum, [, n]) => sum + n, 0);
  assert.ok(total(true) > 0, 'gamers play');
  // A few days' plays are a handful, so "regulars" is more than everyone else put together, not a landslide.
  assert.ok(total(true) > total(false), 'and they are the regulars');
});
