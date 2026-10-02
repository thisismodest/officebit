import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { fresh } from './town.ts';

const lightsOf = (sim: ReturnType<typeof fresh>) => sim.activeItems().filter((i) => i.type.signal);

test('traffic lights take turns: each way gets a green, never both at once, with amber between', () => {
  const sim = fresh();
  sim.step();
  const lights = lightsOf(sim);
  assert.equal(lights.length, 4, 'four, at the crossroads');
  const seen = new Set<string>();
  for (let t = 0; t < 60; t++) {
    sim.step();
    const [ns, ew] = [sim.signals.lampOf(lights[0]!, 'ns'), sim.signals.lampOf(lights[0]!, 'ew')];
    seen.add(`${ns},${ew}`);
    assert.ok(!(ns === 'green' && ew === 'green'), 'never green both ways');
    for (const l of lights) assert.deepEqual([sim.signals.lampOf(l, 'ns'), sim.signals.lampOf(l, 'ew')], [ns, ew], 'every light at a junction agrees');
  }
  for (const lamp of ['red', 'amber', 'green']) assert.ok([...seen].some((s) => s.includes(lamp)), `${lamp} shows`);
});

test('vehicles only drive into the junction on green', () => {
  const sim = fresh();
  sim.step();
  const xs = lightsOf(sim).map((l) => l.def.p[0]);
  const ys = lightsOf(sim).map((l) => l.def.p[1]);
  const inBox = (x: number, y: number) => x > Math.min(...xs) && x < Math.max(...xs) && y > Math.min(...ys) && y < Math.max(...ys);
  const last = new Map<string, { inside: boolean; facing: string; green: boolean }>();
  let crossings = 0;
  for (let t = 0; t < 2 * TICKS_PER_HOUR; t++) {
    sim.step();
    for (const car of sim.traffic.cars) {
      const inside = inBox(Math.round(car.x), Math.round(car.y));
      const before = last.get(car.id);
      if (inside && before && !before.inside) {
        crossings++;
        assert.ok(before.green, `${car.id} went in going ${before.facing} on a light that wasn't green`);
      }
      // Would it be let in on the next step, going the way it's facing (from just outside the box, into it)? The next
      // step's lights: the clock moves on before the traffic does.
      const [x, y] = [Math.round(car.x), Math.round(car.y)];
      const step = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[car.facing]!;
      sim.tick += 1;
      const green = !sim.signals.stop([x, y], [x + step[0]!, y + step[1]!], car.facing) || !inBox(x + step[0]!, y + step[1]!);
      sim.tick -= 1;
      last.set(car.id, { inside, facing: car.facing, green });
    }
  }
  assert.ok(crossings > 5, `${crossings} vehicles went through`);
});
