import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR, hourOf } from '../src/sim/clock.ts';
import { nextDeparture } from '../src/sim/planes.ts';
import { Simulation } from '../src/sim/sim.ts';
import { validate } from '../src/sim/validate.ts';
import type { Tile } from '../src/sim/world.ts';
import { STARTER } from '../src/worlds/starter.ts';
import { fresh, onMap } from './town.ts';

test('flights leave by day: none at night, the first at 08:00', () => {
  const at = (hour: number) => Math.round((hour - 6) * TICKS_PER_HOUR);
  assert.equal(hourOf(nextDeparture(at(9.25))), 9.25, 'by day, straight away');
  assert.equal(hourOf(nextDeparture(at(21))), 8, 'at night: the first in the morning');
  assert.equal(hourOf(nextDeparture(at(7))), 8);
});

/** Put someone at a gate, steered (so they stick to it), flying to another. */
function flier(sim: Simulation, from: Tile, to: Tile) {
  const p = sim.people.find((q) => !q.npc)!;
  sim.interactions.control(p, true);
  const gates = sim.activeItems().filter((i) => i.type.airfield === 'gate');
  const gate = (t: Tile) => gates.find((g) => g.def.p.join() === t.join())!;
  const then = { kind: 'wander' as const, to: { level: 'town', p: [to[0] + 1, to[1] - 2] as Tile } };
  Object.assign(p, { level: 'town', x: from[0] + 1, y: from[1] + 1, px: from[0] + 1, py: from[1] + 1 });
  sim.setLevel(p, 'town');
  (sim as unknown as { begin(p: unknown, i: unknown, walk: boolean): void }).begin(p, { kind: 'fly', from: gate(from).index, to: gate(to).index, after: then }, true);
  return p;
}

test('the plane takes off, flies over, lands on the far stand, and its passengers walk on from the gate', () => {
  const sim = fresh();
  const plane = () => sim.activeItems().find((i) => i.type.airfield === 'plane')!;
  const [west, east] = [onMap('West Field'), onMap('East Field')];
  assert.deepEqual(plane().def.p, [28, 48], 'on its stand at West Field');
  // Someone at West Field's gate before the 08:00, flying to East Field.
  while (hourOf(sim.tick) < 7.8) sim.step();
  const p = flier(sim, west, east);
  let flew = false;
  let high = 0;
  for (let t = 0; t < TICKS_PER_HOUR && !(flew && !p.riding); t++) {
    sim.step();
    flew ||= !!p.riding;
    high = Math.max(high, sim.planes.poseOf(plane())?.up ?? 0);
  }
  assert.ok(flew, 'aboard');
  assert.equal(high, 1, 'up in the air');
  assert.ok(!p.riding, 'and off again');
  assert.deepEqual(plane().def.p, [128, 48], 'on its stand at East Field');
  assert.ok(Math.abs(p.x - (east[0] + 1)) + Math.abs(p.y - (east[1] + 1)) < 3, 'got off at East Field’s gate');
  assert.ok(sim.events.some((e) => e.text.includes('flew to East Field')));
  assert.deepEqual(validate(sim.world), []);
});

test('no pilot in, no flight: it says so in the News', () => {
  const sim = fresh();
  const plane = () => sim.activeItems().find((i) => i.type.airfield === 'plane')!;
  sim.removePerson('jo');
  let flew = false;
  while (hourOf(sim.tick) < 9.5) {
    sim.step();
    flew ||= !!sim.planes.poseOf(plane());
  }
  assert.ok(!flew, 'the plane stayed on its stand');
  assert.ok(sim.events.some((e) => /No flight from West Field: the pilot isn't in/.test(e.text)));
});

test('the pilot flies with the plane, and works from the hangar it lands at', () => {
  const sim = fresh();
  const jo = sim.person('jo')!;
  while (hourOf(sim.tick) < 8.6) sim.step();
  assert.equal(jo.works, 'hangar-east', 'over at East Field now');
});

test('a new airfield joins the round: the plane calls there, and passengers stay aboard till their own', () => {
  // South Field, drawn at the bottom of the map: a runway, an apron, a stand and a gate, and no hangar.
  const world = structuredClone(STARTER);
  const town = world.levels[0]!;
  town.furniture = town.furniture.filter((f) => !(f.p[0] >= 56 && f.p[0] < 98 && f.p[1] >= 148));
  town.rooms.push({ id: 'south-runway', name: 'South Field runway', rect: [60, 151, 32, 3], floor: 'runway' }, { id: 'south-apron', name: 'South Field apron', rect: [72, 154, 12, 6], floor: 'forecourt' });
  const south: Tile = [78, 158];
  town.furniture.push({ t: 'stand', p: [76, 155] }, { t: 'gate', p: south, label: 'South Field' });
  const sim = new Simulation(world);
  const plane = () => sim.activeItems().find((i) => i.type.airfield === 'plane')!;
  while (hourOf(sim.tick) < 7.8) sim.step();
  // Round the town from West Field: East, then South. Flying West to South, they stay aboard at East Field.
  const p = flier(sim, onMap('West Field'), south);
  const called: string[] = [];
  let flew = false;
  for (let t = 0; t < 4 * TICKS_PER_HOUR && !(flew && !p.riding); t++) {
    sim.step();
    flew ||= !!p.riding;
    const at = plane().def.p.join();
    if (!sim.planes.poseOf(plane()) && called.at(-1) !== at) called.push(at);
  }
  assert.deepEqual(called, ['28,48', '128,48', '76,155'], 'West, East, then South');
  assert.ok(flew && !p.riding, 'flew, and got off');
  assert.ok(Math.abs(p.x - (south[0] + 1)) + Math.abs(p.y - (south[1] + 1)) < 3, 'at South Field’s gate');
  // No hangar there: on shift, the pilot waits by the gate.
  assert.deepEqual(sim.planes.crewPost()?.p, [south[0] + 1, south[1] + 1]);
});
