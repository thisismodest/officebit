import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Heading } from '../src/sim/movement.ts';
import { MOVERS } from '../src/sim/movement.ts';
import { VEHICLES, partsOf, type VehicleKind } from '../src/render/vehicles.ts';

const HEADINGS: Heading[] = ['left', 'right', 'up', 'down'];

test('every kind of vehicle has a mover and a look by the same name', () => {
  assert.deepEqual(Object.keys(VEHICLES).sort(), ['bus', 'car', 'truck']);
  for (const kind of Object.keys(VEHICLES)) assert.ok(kind in MOVERS, `${kind} moves`);
});

test('every part of every vehicle is inside its sprite, whichever way it faces', () => {
  for (const kind of Object.keys(VEHICLES) as VehicleKind[]) {
    for (const heading of HEADINGS) {
      const { w, h, rects } = partsOf(kind, heading);
      for (const [x, y, rw, rh, paint] of rects) {
        assert.ok(rw > 0 && rh > 0 && x >= 0 && y >= 0 && x + rw <= w && y + rh <= h, `${kind} ${heading}: ${paint} at ${x},${y} ${rw}×${rh} in ${w}×${h}`);
      }
    }
  }
});

test('side on, facing right is facing left mirrored; the bus has its row of windows', () => {
  for (const kind of Object.keys(VEHICLES) as VehicleKind[]) {
    const left = partsOf(kind, 'left');
    const right = partsOf(kind, 'right');
    assert.deepEqual(right.rects.map(([x, y, rw, rh]) => [left.w - x - rw, y, rw, rh]), left.rects.map(([x, y, rw, rh]) => [x, y, rw, rh]));
  }
  const windows = partsOf('bus', 'left').rects.filter(([, y, , , paint]) => paint === 'glass' && y === 5);
  assert.ok(windows.length >= 5, `${windows.length} windows`);
});
