import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedMessage } from '../src/feeds/protocol.ts';
import { TICKS_PER_DAY, TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { vehicleAt } from '../src/sim/food-trucks.ts';
import { validate } from '../src/sim/validate.ts';
import type { WorldDef } from '../src/sim/world.ts';
import { STARTER } from '../src/worlds/starter.ts';

const fresh = (patch: Partial<WorldDef> = {}) => new Simulation({ ...structuredClone(STARTER), ...patch });
const run = (sim: Simulation, ticks: number) => {
  for (let i = 0; i < ticks; i++) sim.step();
  return sim;
};
/** Run until the clock reads `hour` (on the current or next day). */
const until = (sim: Simulation, hour: number) => run(sim, Math.round(((hour - hourOf(sim.tick) + 24) % 24) * TICKS_PER_HOUR));
const kindOf = (sim: Simulation, id: string) => sim.levels.get(sim.person(id)!.level)!.kind;
const snapshot = (sim: Simulation) => sim.people.map((p) => [p.id, p.level, p.x, p.y, p.intent?.kind]);
const employees = (sim: Simulation) => sim.people.filter((p) => !p.npc);

test('the starter world is valid', () => {
  assert.deepEqual(validate(STARTER), []);
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
  const atWork = employees(sim).filter((p) => sim.companies.get(p.company ?? '')?.levels.includes(p.level));
  assert.ok(atWork.length >= employees(sim).length - 1, `only ${atWork.length} at work at 11:00`);
  assert.ok(sim.events.some((e) => e.text.endsWith('arrived at Head office')));
});

test('people use the stairs', () => {
  const sim = until(fresh(), 11);
  const floors = new Set(employees(sim).map((p) => p.level));
  assert.ok(floors.has('ground') && floors.has('first'), `people on ${[...floors].join(', ')}`);
});

test('family and pets stay home', () => {
  const sim = fresh();
  for (let h = 0; h < 24; h++) {
    run(sim, TICKS_PER_HOUR);
    for (const p of sim.people.filter((q) => q.npc && !q.role)) assert.equal(p.level, p.home, `${p.name} left home`);
  }
});

test('personalities show up in behaviour', () => {
  const sim = until(fresh(), 18);
  const by = (id: string) => sim.person(id)!;
  assert.ok(by('theo').stats.interruptions + by('cal').stats.interruptions > 0, 'distractors interrupt people');
  assert.ok(by('hana').stats.work > by('cal').stats.work, 'the workhorse out-works the distractor');
});

test('people without a home come and go via the spawn point', () => {
  const world = structuredClone(STARTER);
  world.people[0]!.home = undefined;
  const sim = until(new Simulation(world), 3);
  assert.equal(sim.person(world.people[0]!.id)!.hidden, true);
  until(sim, 11);
  assert.equal(sim.person(world.people[0]!.id)!.hidden, false);
});

test('feed: away sends someone home, here brings them back', () => {
  const sim = until(fresh(), 11);
  sim.applyFeed({ id: 'dev', presence: 'away' });
  run(sim, 2 * TICKS_PER_HOUR);
  assert.equal(kindOf(sim, 'dev'), 'home');

  sim.applyFeed({ id: 'dev', presence: 'here' });
  run(sim, 2 * TICKS_PER_HOUR);
  assert.equal(kindOf(sim, 'dev'), 'building');
});

test('feed: focus means desk and headphones, and interrupters bounce off', () => {
  const sim = until(fresh(), 10);
  const before = sim.person('ada')!.stats.interrupted;
  sim.applyFeed({ id: 'ada', activity: 'focus' });
  run(sim, 4 * TICKS_PER_HOUR);
  const ada = sim.person('ada')!;
  assert.equal(ada.intent?.kind, 'work');
  assert.equal(ada.stats.interrupted, before);
});

test('feed: meeting sends people to the meeting room', () => {
  const sim = until(fresh(), 10);
  for (const id of ['ada', 'bea', 'eli']) sim.applyFeed({ id, activity: 'meeting', room: 'meeting' });
  run(sim, TICKS_PER_HOUR);
  const room = sim.findRoom('meeting')!;
  for (const id of ['ada', 'bea', 'eli']) {
    const p = sim.person(id)!;
    assert.equal(p.level, room.level, `${p.name} on ${p.level}`);
    assert.equal(sim.grids.get(p.level)!.roomAt(Math.round(p.x), Math.round(p.y)), room.room, `${p.name} in the meeting room`);
  }
  sim.applyFeed({ id: 'ada', activity: null });
  run(sim, 1);
  assert.notEqual(sim.person('ada')!.intent?.kind, 'meeting');
});

test('feed: external ids map through world.feed.ids, and NPCs ignore feeds', () => {
  const sim = fresh({ feed: { ids: { U024BE7LH: 'bea' } } });
  assert.equal(sim.applyFeed({ id: 'U024BE7LH', bubble: '📞' }), true);
  assert.equal(sim.person('bea')!.status.bubble, '📞');
  assert.equal(sim.applyFeed({ id: 'nobody' }), false);
  assert.equal(sim.applyFeed({ id: 'biscuit', presence: 'away' }), false);
});

test('feed messages are validated', () => {
  assert.deepEqual(parseFeedMessage({ id: 'a', presence: 'here', bubble: '🎧' }), { id: 'a', presence: 'here', bubble: '🎧' });
  assert.deepEqual(parseFeedMessage({ id: 'a', activity: null }), { id: 'a', activity: null });
  assert.equal(parseFeedMessage({ id: 'a', presence: 'sleeping' }), null);
  assert.equal(parseFeedMessage({ id: 'a', bubble: 42 }), null);
  assert.equal(parseFeedMessage({ presence: 'here' }), null);
  assert.equal(parseFeedMessage('nope'), null);
  assert.equal(parseFeedMessage({ id: 'a', label: 'x'.repeat(500) })!.label!.length, 80);
});

test('weekends: nobody goes to work on Saturday', () => {
  const sim = run(fresh(), 5 * TICKS_PER_DAY);
  until(sim, 11);
  assert.ok(employees(sim).every((p) => sim.levels.get(p.level)!.kind !== 'building'), 'the office should be empty on Saturday');
});

test('food trucks: open for weekday lunch, and people pop out to them', () => {
  const sim = fresh();
  const trucks = sim.activeItems().filter((i) => i.type.street);
  let visits = 0;
  for (let day = 0; day < 5; day++) {
    until(sim, 11.9);
    assert.ok(trucks.every((t) => !sim.isOpen(t)), 'closed before noon');
    for (let t = 0; t < 2 * TICKS_PER_HOUR; t++) {
      sim.step();
      visits += sim.people.filter((p) => p.intent?.kind === 'use' && sim.items[p.intent.item]!.type.street && p.phase === 'doing').length;
    }
    until(sim, 15);
    assert.ok(trucks.every((t) => !sim.isOpen(t)), 'gone by the afternoon');
  }
  assert.ok(visits > 0, 'someone had lunch from a truck this week');
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

test('the diner: open all hours, staffed through the night, a treat rather than a habit', () => {
  const sim = until(fresh(), 3);
  const ray = sim.person('ray')!;
  assert.equal(ray.level, 'diner', 'Ray works nights');
  assert.notEqual(ray.intent?.kind, 'sleep');
  assert.equal(sim.person('dot')!.level, 'home-dot', 'Dot is home asleep before her day shift');
  until(sim, 11);
  assert.equal(sim.person('dot')!.level, 'diner', 'and on shift by late morning');

  const outings = new Map<string, number>();
  const inside = new Set<string>();
  for (let t = 0; t < 14 * TICKS_PER_DAY; t++) {
    sim.step();
    for (const p of employees(sim)) {
      const there = p.level === 'diner';
      if (there && !inside.has(p.id)) outings.set(p.id, (outings.get(p.id) ?? 0) + 1);
      if (there) inside.add(p.id);
      else inside.delete(p.id);
    }
  }
  assert.ok(outings.size > 0, 'someone went to the diner');
  for (const [id, n] of outings) assert.ok(n <= 14, `${id} went ${n} times in a fortnight`);
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
  // On the road (or the highway) all the way, until it pulls off onto the pitch.
  const [px, py] = truck!.def.p;
  let offRoad = 0;
  while (vehicleAt(sim, truck!)?.moving) {
    sim.step();
    const pose = vehicleAt(sim, truck!);
    // Pulling up onto the pitch: just over the pavement, straight off the road in front.
    const near = pose && Math.abs(pose.x - px) <= 2 && pose.y >= py && pose.y <= py + 3;
    if (pose && !near && !['road', 'highway', 'zebra', 'zebraSide', undefined].includes(floor(pose.x, pose.y))) offRoad++;
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

test('groceries: cooking uses the pantry, and people shop before it runs dry', () => {
  const sim = fresh();
  const pantries = sim.world.pantries!;
  let shops = 0;
  sim.onEvent((e) => (shops += e.text.includes('food shop') ? 1 : 0));
  let empty = 0;
  for (let t = 0; t < 14 * TICKS_PER_DAY; t++) {
    sim.step();
    if (t % TICKS_PER_HOUR === 0) empty += Object.values(pantries).filter((v) => v < 1).length;
  }
  assert.ok(shops > 0, 'someone did a food shop');
  const homeHours = Object.keys(pantries).length * 14 * 24;
  assert.ok(empty < homeHours * 0.02, `kitchens were bare for ${empty} of ${homeHours} home-hours`);
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
  const liked = chatWith();
  for (let i = 0; i < 40; i++) sim.relationships.interrupted(b!, a!);
  assert.ok(sim.affinity(a!, b!) <= -0.3);
  assert.ok(chatWith() < liked - 0.5, 'far less keen to chat');
});

test('love: friends with a spark start seeing each other, date, and move in together; freed homes go to let', () => {
  const sim = until(fresh(), 17);
  const singles = sim.people.filter((p) => sim.love.available(p) && !p.npc);
  const pair = singles.flatMap((a) => singles.filter((b) => b !== a && sim.love.spark(a, b) && sim.relationships.compatibility(a, b) > 0.4).map((b) => [a, b] as const))[0]!;
  const [a, b] = pair;
  // Make them close friends, then let them talk until one asks.
  for (let i = 0; i < 20; i++) sim.relationships.together(a, b, 1000, 2);
  for (let i = 0; i < 200 && !sim.love.coupleOf(a); i++) sim.love.met(a, b);
  assert.equal(sim.love.partnerOf(a), b);
  const homes = [a.home, b.home];

  run(sim, 8 * TICKS_PER_DAY);
  for (let i = 0; i < 20; i++) sim.relationships.together(a, b, 1000, 2);
  until(sim, 11);
  assert.ok(sim.love.coupleOf(a)?.together, 'living together');
  assert.equal(a.home, b.home);
  // The home they left is free: to let, or already taken by a newcomer.
  const left = homes.find((h) => h !== a.home)!;
  assert.ok(sim.housing.vacant().some((h) => h.level.id === left) || sim.people.some((p) => p.home === left && p !== a && p !== b), 'someone else can move into the home they left');
  assert.ok(homes.some((h) => h !== a.home) || homes[0] === homes[1]);
  assert.match(sim.levels.get(a.home!)!.name, / and /);
  assert.deepEqual(validate(sim.world), []);
});

test('love: a world can opt out', () => {
  const sim = fresh({ love: false });
  const [a, b] = sim.people.filter((p) => sim.love.available(p));
  for (let i = 0; i < 20; i++) sim.relationships.together(a!, b!, 1000, 2);
  for (let i = 0; i < 200; i++) sim.love.met(a!, b!);
  assert.equal(sim.love.couples.length, 0);
});

test('newcomers move into a house that is to let', () => {
  const sim = fresh();
  const free = sim.housing.vacant().length;
  const p = sim.hire({ id: 'newbie', name: 'Newbie', look: [0, 0, 0, 0] });
  assert.ok(p.home?.startsWith('home-to-let'));
  assert.equal(sim.housing.vacant().length, free - 1);
  assert.equal(sim.levels.get(p.home!)!.name, "Newbie's house");
});

test('gamers seek out the arcade machines, and play them most', () => {
  const sim = new Simulation(structuredClone(STARTER));
  const goes = new Map<string, number>();
  const last = new Map<string, number>();
  for (let t = 0; t < 7 * TICKS_PER_DAY; t++) {
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
  assert.ok(total(true) > 3 * total(false), 'and they are the regulars');
});
