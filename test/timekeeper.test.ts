import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TICKS_PER_DAY, TICKS_PER_HOUR, formatClock, formatTime, weekdayOf } from '../src/sim/clock.ts';
import { Simulation } from '../src/sim/sim.ts';
import { Timekeeper, liveOrigin, liveTick } from '../src/ui/timekeeper.ts';
import { STARTER } from '../src/worlds/starter.ts';

const fresh = () => new Simulation(structuredClone(STARTER));
// Thursday 1 October 2026, 14:30 local time.
const THURSDAY = new Date(2026, 9, 1, 14, 30).getTime();

test('live time is pinned to 06:00 today, on the right weekday', () => {
  const origin = liveOrigin(new Date(THURSDAY));
  assert.equal(weekdayOf(origin.tick), 'Thu');
  assert.equal(formatTime(liveTick(origin, THURSDAY)), '14:30');
  // Before 06:00 it's still yesterday, as far as the sim is concerned.
  const early = liveOrigin(new Date(2026, 9, 1, 3, 0));
  assert.equal(weekdayOf(early.tick), 'Wed');
});

test('live mode catches up to the clock, then runs a game second per real second', () => {
  let now = THURSDAY;
  const time = new Timekeeper('live', () => now);
  const sim = fresh();
  time.start(sim);
  assert.ok(liveTick(time.origin!, now) - sim.tick <= 1, 'already caught up when it starts, before a frame is drawn');
  assert.equal(weekdayOf(sim.tick), 'Thu');

  const before = sim.tick;
  for (let i = 0; i < 60; i++) {
    now += 1000;
    time.advance(sim, 1000);
  }
  // A minute of real time is a minute of game time: 10 ticks.
  assert.ok(Math.abs(sim.tick - before - 10) < 1.5, `advanced ${sim.tick - before} ticks`);
});

test('live mode fast-forwards after the tab has been hidden', () => {
  let now = THURSDAY;
  const time = new Timekeeper('live', () => now);
  const sim = fresh();
  time.start(sim);
  now += 12 * 60 * 60 * 1000;
  time.advance(sim, 16);
  assert.ok(time.catchingUp, "catching up, so there's nothing to draw yet");
  for (let i = 0; i < 2000 && time.catchingUp; i++) time.advance(sim, 16);
  assert.ok(liveTick(time.origin!, now) - sim.tick < 2);
});

test('sandbox runs at the chosen speed, and not at all when paused', () => {
  const time = new Timekeeper('sandbox');
  const sim = fresh();
  time.start(sim);
  time.speed = 4;
  time.advance(sim, 1000);
  assert.equal(sim.tick, 40);
  time.speed = 0;
  time.advance(sim, 1000);
  assert.equal(sim.tick, 40);
});

test('time travel fast-forwards to the target and leaves live mode', () => {
  const time = new Timekeeper('live', () => THURSDAY);
  const sim = fresh();
  time.start(sim);
  const to = sim.tick + TICKS_PER_DAY + 2 * TICKS_PER_HOUR;
  time.travel(sim, to);
  assert.equal(time.mode, 'sandbox');
  while (time.travelling) time.advance(sim, 16);
  assert.ok(Math.abs(sim.tick - to) <= 1);
  assert.equal(weekdayOf(sim.tick), 'Fri');
});

test('a step covering less game time drains needs by less, but walks just as far', () => {
  const a = fresh();
  const b = fresh();
  for (let i = 0; i < 300; i++) a.step();
  for (let i = 0; i < 300; i++) b.step(0.5);
  assert.equal(a.tick, 300);
  assert.equal(b.tick, 150);
  // Among those who've slept through it in both, so nobody's breakfast muddles it.
  const sleepers = a.people.filter((p) => p.intent?.kind === 'sleep' && b.person(p.id)?.intent?.kind === 'sleep').map((p) => p.id);
  const hunger = (sim: Simulation) => sleepers.reduce((sum, id) => sum + sim.person(id)!.needs.hunger, 0);
  assert.ok(sleepers.length > 5 && hunger(b) > hunger(a), 'half the game time, less hungry');
});

test('jumping ahead plays out over about eight seconds, and short hops at 60×', () => {
  const secondsFor = (ticks: number) => {
    const time = new Timekeeper('sandbox');
    const sim = fresh();
    time.start(sim);
    time.travel(sim, sim.tick + ticks);
    let ms = 0;
    while (time.travelling && ms < 60_000) {
      time.advance(sim, 16);
      ms += 16;
    }
    return ms / 1000;
  };
  const day = secondsFor(TICKS_PER_DAY);
  assert.ok(day > 7 && day < 9, `a day took ${day}s`);
  const hour = secondsFor(TICKS_PER_HOUR);
  assert.ok(hour > 0.8 && hour < 1.2, `an hour took ${hour}s (60×)`);
});

test('live mode carries on from the day it started, catching up a slice at a time', () => {
  const days = 3;
  const now = new Date(2026, 8, 30, 10, 0).getTime();
  const time = new Timekeeper('live', () => now);
  time.since = now - days * 24 * 3600 * 1000;
  const sim = fresh();
  time.start(sim);
  assert.ok(time.catchingUp, 'more than a day behind: it catches up over a few frames');
  for (let i = 0; i < 1000 && time.catchingUp; i++) time.advance(sim, 16);
  assert.ok(!time.catchingUp);
  assert.ok(sim.tick >= days * TICKS_PER_DAY, `${days} days of story so far`);
  // Days are counted from the day it started: three days on, it's Day 4, whatever weekday it began.
  assert.match(formatClock(sim.tick, sim.firstDay), /· Day 4$/);
});
