import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR, tickAt } from '../src/sim/clock.ts';
import type { Person } from '../src/sim/person.ts';
import { ACTIVITIES, type ActivityId } from '../src/sim/plans.ts';
import type { Simulation } from '../src/sim/sim.ts';
import { restore, snapshot } from '../src/sim/snapshot.ts';
import { validate } from '../src/sim/validate.ts';
import { befriend, freshFrom, run } from './town.ts';

/** A June week in the test town, up to early Saturday (before the day's plans are made), watching the plans made on the way: once, shared. */
let week: { snap: ReturnType<typeof snapshot>; made: number; doubleBooked: number; oversized: number } | undefined;
const theWeek = () => {
  if (week) return week;
  const sim = freshFrom([2026, 6, 1]);
  const seen = new Set<number>();
  let doubleBooked = 0;
  let oversized = 0;
  while (sim.tick < tickAt(5, 7)) {
    sim.step();
    const members = sim.plans.list.flatMap((plan) => plan.members);
    if (new Set(members).size !== members.length) doubleBooked++;
    for (const plan of sim.plans.list) {
      if (seen.has(plan.id)) continue;
      seen.add(plan.id);
      if (plan.members.length < 2 || plan.members.length > ACTIVITIES[plan.activity].group[1]) oversized++;
    }
  }
  week = { snap: snapshot(sim), made: seen.size, doubleBooked, oversized };
  return week;
};
/** Saturday, 07:00, in June: a day off for everyone, and nothing planned yet. */
const saturday = (): Simulation => restore(structuredClone(theWeek().snap));
const LATE_MORNING = tickAt(5, 11);

/** `organiser` suggests it to friends (asking again if everyone happens to say no), and here's the plan. */
const suggest = (sim: Simulation, organiser: Person, activity: ActivityId, friends: Person[], start = LATE_MORNING) => {
  for (const friend of friends) befriend(sim, organiser, friend);
  for (let tries = 0; tries < 10; tries++) {
    const plan = sim.plans.suggest(organiser, activity, start);
    if (plan) return plan;
  }
  assert.fail(`nobody would come to ${organiser.name}'s ${activity}`);
};
/** On to the end of a plan, noting whether `seen` was ever true on the way. */
const through = (sim: Simulation, end: number, seen: () => boolean) => {
  let saw = false;
  while (sim.tick < end + TICKS_PER_HOUR) {
    sim.step();
    saw ||= seen();
  }
  return saw;
};
const who = (sim: Simulation, ...ids: string[]) => ids.map((id) => sim.person(id)!);

test('the daily round of plans: people make them, never more than it takes, and nobody is in two at once', () => {
  const { made, doubleBooked, oversized } = theWeek();
  assert.ok(made > 0, 'plans were made over the week');
  assert.equal(oversized, 0, 'no more than it takes, family and all');
  assert.equal(doubleBooked, 0, 'never in two plans at once');
});

test('frisbee in the park: friends meet on the grass, play, and get on better for it', () => {
  const sim = saturday();
  const [bea, ada, cal] = who(sim, 'bea', 'ada', 'cal');
  const plan = suggest(sim, bea!, 'catch', [ada!, cal!]);
  assert.equal(plan.level, 'town');
  const park = sim.levels.get('town')!.rooms.find((r) => r.park)!.rect;
  assert.ok(plan.at[0] >= park[0] && plan.at[0] < park[0] + park[2] && plan.at[1] >= park[1] && plan.at[1] < park[1] + park[3], 'in the park');
  // Bea's friends, not (yet) each other's: a game together brings them closer.
  const guests = who(sim, ...plan.members.filter((id) => id !== 'bea'));
  const before = guests.length > 1 ? sim.affinity(guests[0]!, guests[1]!) : 0;
  const played = through(sim, plan.end, () => sim.people.some((p) => p.intent?.kind === 'play' && p.phase === 'doing'));
  assert.ok(played, 'a game in the park');
  assert.ok(sim.events.some((e) => e.text.startsWith('🥏') && / at /.test(e.text)), 'in the News');
  if (guests.length > 1) assert.ok(sim.affinity(guests[0]!, guests[1]!) > before, 'and they get on better for it');
});

test('a picnic: the family comes along, a blanket goes down on the grass, and it is packed up after', () => {
  const sim = saturday();
  const [rowan, bea, ada] = who(sim, 'rowan', 'bea', 'ada');
  const plan = suggest(sim, rowan!, 'picnic', [bea!, ada!]);
  assert.ok(plan.members.includes('jules') && plan.members.includes('isla'), 'partner and children along');
  const blanket = through(sim, plan.end, () => sim.activeItems().some((i) => i.def.t === 'picnicBlanket'));
  assert.ok(blanket, 'a picnic laid out');
  assert.ok(!sim.activeItems().some((i) => i.def.t === 'picnicBlanket'), 'and packed up after');
  assert.deepEqual(validate(sim.world), []);
});

test('a meal out: three friends at the diner, at its seats', () => {
  const sim = saturday();
  const [bea, ada, cal, sam] = who(sim, 'bea', 'ada', 'cal', 'sam');
  const plan = suggest(sim, bea!, 'meal', [ada!, cal!, sam!]);
  assert.equal(plan.level, 'diner');
  assert.ok(plan.members.length >= ACTIVITIES.meal.group[0]);
  const there = through(sim, plan.end, () => plan.members.filter((id) => sim.person(id)?.level === 'diner').length >= 2);
  assert.ok(there, 'together at the diner');
});

test('working on projects together: makers get their laptops out, away from a desk', () => {
  const sim = saturday();
  const [mo, hana] = who(sim, 'mo', 'hana');
  const plan = suggest(sim, mo!, 'cowork', [hana!]);
  assert.ok(['town', 'diner'].includes(plan.level), `at a worktop: a bench or a booth (${plan.level})`);
  const laptops = through(sim, plan.end, () => sim.people.some((p) => p.intent?.kind === 'hustle' && p.phase === 'doing' && !sim.items[p.intent.item]!.type.study));
  assert.ok(laptops, 'laptops out, away from a desk');
});

test('nobody is asked to a second plan at the same time', () => {
  const sim = saturday();
  const [bea, ada, cal] = who(sim, 'bea', 'ada', 'cal');
  const first = suggest(sim, bea!, 'catch', [ada!]);
  befriend(sim, cal!, ada!);
  const second = sim.plans.suggest(cal!, 'meetup', LATE_MORNING);
  assert.ok(!second?.members.some((id) => first.members.includes(id)), 'not both');
});

test("plans go where they belong: the park's games on the grass, the rest at somewhere with seats", () => {
  const sim = saturday();
  const seen = new Map<number, { activity: ActivityId; level: string }>();
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    run(sim, 1);
    for (const plan of sim.plans.list) seen.set(plan.id, plan);
  }
  for (const plan of seen.values()) {
    const where = ACTIVITIES[plan.activity].where;
    if (where === 'park') assert.equal(plan.level, 'town', `${plan.activity} in the park`);
    if (where === 'gather') assert.ok(['diner', 'garden'].includes(plan.level), `${plan.activity} at ${plan.level}`);
  }
});
