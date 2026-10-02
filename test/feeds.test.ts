// Feeds: outside data steering people.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeedMessage } from '../src/feeds/protocol.ts';
import { TICKS_PER_HOUR } from '../src/sim/clock.ts';
import { fresh, run, until, kindOf } from './town.ts';

test('feed: away sends someone home, here brings them back', () => {
  const sim = until(fresh(), 11);
  sim.applyFeed({ id: 'dev', presence: 'away' });
  // Home, and not back at work (a walk or an outing after is their own time).
  let home = false;
  for (let t = 0; t < 2 * TICKS_PER_HOUR; t++) {
    run(sim, 1);
    home ||= kindOf(sim, 'dev') === 'home';
    if (home) assert.notEqual(kindOf(sim, 'dev'), 'building', 'back at work while away');
  }
  assert.ok(home, 'went home');

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
