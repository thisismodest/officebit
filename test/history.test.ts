import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ViewHistory } from '../src/ui/history.ts';

const view = (person: string | null, level = 'town') => ({ person, level, x: 0, y: 0, zoom: 2 });

test('back returns the views you left, most recent first, and the same person twice counts once', () => {
  const h = new ViewHistory();
  assert.equal(h.canGoBack, false);
  h.push(view('bea'));
  h.push(view('bea', 'first'));
  h.push(view(null, 'diner'));
  h.push(view('dot'));
  assert.deepEqual([h.back()?.person, h.back()?.level, h.back()?.level], ['dot', 'diner', 'first']);
  assert.equal(h.canGoBack, false);
});

test('only the last thirty steps are kept', () => {
  const h = new ViewHistory();
  for (let i = 0; i < 40; i++) h.push(view(`p${i}`));
  let n = 0;
  while (h.back()) n++;
  assert.equal(n, 30);
});
