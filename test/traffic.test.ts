import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY } from '../src/sim/clock.ts';
import { AHEAD } from '../src/sim/movement.ts';
import { Simulation } from '../src/sim/sim.ts';
import { STARTER } from '../src/worlds/starter.ts';
import { onMap } from './town.ts';

const CHARGING = onMap('chargingCanopy');

const fresh = () => new Simulation(structuredClone(STARTER));

test('cars keep to the left: along the Street, east in the north lane and west in the south', () => {
  const roads = fresh().traffic.roads()!;
  const main = 68;
  const east = roads.route([20, main + 1], [140, main + 1], 'right')!;
  const west = roads.route([140, main], [20, main], 'left')!;
  const middle = (path: [number, number][]) => path.filter(([x]) => x > 40 && x < 120);
  assert.ok(middle(east).every(([, y]) => y === main), 'eastbound, the north lane');
  assert.ok(middle(west).every(([, y]) => y === main + 1), 'westbound, the south lane');
});

test('through-traffic drives along the highway, each lane its own way, the same every time', () => {
  const [a, b] = [fresh(), fresh()];
  for (let i = 0; i < 600; i++) {
    a.step();
    b.step();
  }
  const cars = a.traffic.cars.filter((c) => c.through);
  assert.ok(cars.length > 4, `${cars.length} cars on the highway`);
  for (const car of cars) {
    const lane = a.traffic.lanes().find((l) => l.y === car.y)!;
    assert.equal(car.facing, lane.heading, 'going the lane’s way');
  }
  assert.deepEqual(
    b.traffic.cars.map((c) => [c.x, c.y]),
    a.traffic.cars.map((c) => [c.x, c.y]),
  );
});

test('a visitor turns off the highway, parks, gets out for their errand, then drives on', () => {
  const sim = fresh();
  const seen = new Set<string>();
  let parkedAt: [number, number] | null = null;
  for (let t = 0; t < 3 * TICKS_PER_DAY && !(seen.size > 0 && !sim.people.some((p) => p.role === 'visitor')); t++) {
    sim.step();
    for (const p of sim.people) if (p.role === 'visitor') seen.add(p.id);
    const car = sim.traffic.cars.find((c) => c.parked && !sim.cars.owned.some((o) => o.car === c));
    if (car) parkedAt = [car.x, car.y];
  }
  assert.ok(seen.size > 0, 'someone visited');
  assert.ok(parkedAt && parkedAt[0] >= CHARGING[0] && parkedAt[0] < CHARGING[0] + 9, 'parked at the charging station');
  assert.ok(sim.events.some((e) => /visitor (pulled in|stopped)/.test(e.text)), 'and it made the news');
  assert.ok(!sim.people.some((p) => p.role === 'visitor'), 'and they left again');
  assert.ok(!sim.world.npcs.some((n) => n.role === 'visitor'), 'visitors are never saved');
});

test('cars wait for someone on a zebra crossing, then carry on', () => {
  const sim = fresh();
  const bea = sim.person('bea')!;
  sim.interactions.control(bea, true);
  Object.assign(bea, { level: 'town', x: 77, y: 51, px: 77, py: 51, hidden: false, transit: 0 });
  const car = sim.traffic.add(0.3, [60, 51], [[100, 51]]);
  car.facing = 'right';
  for (let i = 0; i < 200; i++) sim.step();
  assert.ok(car.x < 77 && car.x > 70, `waiting short of the crossing, at ${car.x}`);
  Object.assign(bea, { y: 53, py: 53 });
  for (let i = 0; i < 200; i++) sim.step();
  assert.equal(car.x, 100, 'and on its way once she’s across');
});

test('a parked car stays exactly where it is, nose in', () => {
  const sim = fresh();
  let parked = 0;
  const bayAt = (x: number, y: number) =>
    sim.activeItems().find((i) => (i.type.parking || i.type.loading) && Math.round(x) >= i.def.p[0] && Math.round(x) < i.def.p[0] + i.type.size[0] && Math.round(y) >= i.def.p[1] && Math.round(y) < i.def.p[1] + i.type.size[1]);
  for (let t = 0; t < 2 * TICKS_PER_DAY; t++) {
    sim.step();
    for (const c of sim.traffic.cars.filter((c) => c.parked)) {
      parked++;
      assert.deepEqual([c.px, c.py], [c.x, c.y]);
      // A food truck faces the pavement it serves; a car faces into its bay (the tile behind, where it pulled in from, isn't a bay).
      // Just behind it, past the bay's open end (half its length on from the middle, where the car stands).
      const bay = bayAt(c.x, c.y);
      const reach = bay ? (Math.max(...bay.type.size) + 1) / 2 : 1;
      const [bx, by] = [c.x - AHEAD[c.facing][0] * reach, c.y - AHEAD[c.facing][1] * reach];
      if (c.truck !== undefined) assert.equal(c.facing, 'up', 'the truck faces the pavement');
      else assert.ok(bay && !bayAt(bx, by), 'nose in');
    }
  }
  assert.ok(parked > 0);
});

test('cars take a path only when there’s no other way, and back out of a bay', () => {
  const sim = fresh();
  const roads = sim.traffic.roads()!;
  // Along the Street, a car keeps to the road, even though the pavement beside it is shorter to reach.
  assert.ok(roads.route([20, 69], [60, 69], 'right')!.every(([, y]) => y === 68 || y === 69), 'on the road');
  // To a spot only a path reaches (a house's front path), it goes along the path.
  const house = sim.levels.get('town')!.furniture.find((f) => f.t === 'detached' && !f.faces)!;
  const door: [number, number] = [house.p[0] + 1, house.p[1] + 3];
  assert.ok(roads.route([20, 69], door), 'up the front path to the door');
  // Visitors back out: the first move off a bay keeps the car facing in.
  let backedOut = false;
  for (let t = 0; t < 2 * TICKS_PER_DAY && !backedOut; t++) {
    sim.step();
    backedOut = sim.traffic.cars.some((c) => c.reversing && c.facing === 'up');
  }
  assert.ok(backedOut, 'reversing out, still facing the bay');
});

test('cars come in by any road for a drive round town, and leave again by day’s end', () => {
  const sim = fresh();
  const seen = new Set<string>();
  let inTown = 0;
  const level = sim.levels.get(sim.traffic.level!)!;
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.step();
    for (const car of sim.visitors.touring) {
      seen.add(car.id);
      // Well into town, off the highway.
      if (car.x > 5 && car.x < level.size[0] - 5 && car.y > 20) inTown++;
    }
  }
  assert.ok(seen.size >= 4, `${seen.size} drives round town in a day`);
  assert.ok(inTown > 0, 'they drive through town');
  assert.equal(sim.visitors.touring.filter((c) => !c.removed).length, 0, 'and all gone by the small hours');
});

test('cars wait for a gap before driving onto the highway', () => {
  const sim = fresh();
  const highway = (x: number, y: number) => sim.traffic.roads()!.floorAt(Math.round(x), Math.round(y)) === 'highway';
  const was = new Map<string, boolean>();
  let joins = 0;
  for (let t = 0; t < TICKS_PER_DAY; t++) {
    sim.step();
    for (const car of sim.traffic.cars) {
      const on = highway(car.x, car.y);
      // From a road (not on along the highway from the edge of the map, or over the footbridge's deck).
      if (on && was.get(car.id) === false && (car.facing === 'up' || car.facing === 'down')) {
        joins++;
        // Nothing bearing down on it along any lane, close by.
        const near = sim.traffic.cars.filter((o) => o !== car && highway(o.x, o.y) && o.facing !== car.facing && Math.abs(o.y - car.y) < 4 && (o.facing === 'right' ? car.x - o.x : o.x - car.x) > 0.5 && Math.abs(o.x - car.x) < 4);
        assert.deepEqual(near.map((o) => o.id), [], `${car.id} pulled out in front of traffic`);
      }
      was.set(car.id, on);
    }
  }
  assert.ok(joins > 3, `${joins} cars onto the highway`);
});
