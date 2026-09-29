import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY, HEAD, LEGS, SPRITE_W } from '../src/render/characters.ts';

test('character templates are all sprite-width', () => {
  const templates = { ...HEAD, bodyFront: BODY.front, bodySide: BODY.side, ...LEGS.front, ...Object.fromEntries(Object.entries(LEGS.side).map(([k, v]) => [`side-${k}`, v])) };
  for (const [name, rows] of Object.entries(templates)) {
    for (const [i, row] of rows.entries()) assert.equal(row.length, SPRITE_W, `${name} row ${i}: "${row}"`);
  }
});

test('front and back views are left-right symmetric (highlights aside)', () => {
  for (const rows of [HEAD.front, HEAD.back, BODY.front, LEGS.front.stand]) {
    for (const row of rows) {
      const shape = row.replaceAll('L', 'h');
      assert.equal(shape, [...shape].reverse().join(''), row);
    }
  }
});

test('pet templates fit the pet sprite', async () => {
  const { CAT, DOG, PET_W, PET_H } = await import('../src/render/pets.ts');
  for (const [name, poses] of Object.entries({ CAT, DOG })) {
    for (const [pose, rows] of Object.entries(poses)) {
      assert.equal(rows.length, PET_H, `${name} ${pose} height`);
      for (const row of rows) assert.ok(row.length <= PET_W, `${name} ${pose}: "${row}"`);
    }
  }
});
