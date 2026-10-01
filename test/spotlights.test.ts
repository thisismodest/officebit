import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchSpotlights, readMeta } from '../scripts/spotlights.ts';
import { TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { turnOf } from '../src/render/spotlights.ts';
import { STARTER } from '../src/worlds/starter.ts';

test('a spotlight page’s title, name, line and picture, from its Open Graph tags', () => {
  const html = `<head><meta property="og:title" content="QuestBar: Your quest, always in sight" />
    <meta content="Keep your task in sight &amp; done." property="og:description">
    <meta property="og:image" content="/images/app-icon.png"></head>`;
  assert.deepEqual(readMeta(html, 'https://questbar.app/'), {
    title: 'QuestBar: Your quest, always in sight',
    name: 'QuestBar',
    description: 'Keep your task in sight & done.',
    image: 'https://questbar.app/images/app-icon.png',
    icons: ['https://questbar.app/favicon.ico'],
  });
  // No Open Graph: the page's own title and description, and a Twitter card's picture.
  const plain = readMeta('<title>modest-ui | A CSS library</title><meta name="description" content="Minimal."><meta name="twitter:image" content="https://x.test/a.png">', 'https://modest-ui.com');
  assert.deepEqual([plain.name, plain.description, plain.image], ['modest-ui', 'Minimal.', 'https://x.test/a.png']);
});

test('a spotlight’s icon, for the posters: an apple-touch-icon first, then an SVG icon, any other, and the favicon', () => {
  const html = `<link rel="icon" href="/favicon.png" sizes="32x32"><link rel="icon" type="image/svg+xml" href="./favicon.svg"><link rel="apple-touch-icon" href="images/app-icon.png">`;
  assert.deepEqual(readMeta(html, 'https://vimscoops.dev/').icons, [
    'https://vimscoops.dev/images/app-icon.png',
    'https://vimscoops.dev/favicon.svg',
    'https://vimscoops.dev/favicon.png',
    'https://vimscoops.dev/favicon.ico',
  ]);
});

test('the panels take turns: a new spot each game hour, each panel a step ahead of the one before', () => {
  assert.deepEqual([0, 1, 2].map((panel) => turnOf(panel, 0, 3)), [0, 1, 2]);
  assert.deepEqual([0, 1, 2].map((panel) => turnOf(panel, TICKS_PER_HOUR, 3)), [1, 2, 0]);
  assert.equal(turnOf(0, 5 * TICKS_PER_HOUR + 10, 3), 2);
  assert.equal(turnOf(4, 0, 0), 0, 'no spotlights: the house spotlight');
});

test('a spotlight that can’t be fetched is left out, for the house spotlight to stand in', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'spotlights-'));
  try {
    const index = await fetchSpotlights(dir, ['http://127.0.0.1:9/']);
    assert.deepEqual(index, {});
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'index.json'), 'utf8')), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the town has billboards by the highway, and a poster at every bus stop', () => {
  const town = STARTER.levels.find((l) => l.kind === 'outside')!;
  assert.equal(town.furniture.filter((f) => f.t === 'billboard').length, 2);
  assert.equal(town.furniture.filter((f) => f.t === 'busStop').length, 8);
});
