import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Composer, PHRASE_BARS, scaleNotes } from '../src/audio/composer.ts';

const bars = (n: number, seed = 7, night = false) => {
  const c = new Composer(seed);
  return Array.from({ length: n }, () => c.next({ night }));
};
const pitchClass = (p: number) => ((p % 12) + 12) % 12;

test('every melody note is in D major pentatonic, within a gentle range', () => {
  const scale = new Set(scaleNotes().map(pitchClass));
  for (const bar of bars(200)) {
    for (const note of bar.melody) {
      assert.ok(scale.has(pitchClass(note.pitch)), `${note.pitch} is in the scale`);
      assert.ok(note.pitch >= 59 && note.pitch <= 86, `${note.pitch} is in range`);
      assert.ok(note.at >= -0.05 && note.at < 4, 'inside the bar');
    }
  }
});

test('the melody moves in small steps, and every phrase settles on a chord tone', () => {
  for (const bar of bars(200)) {
    const pitches = bar.melody.map((n) => n.pitch);
    for (let i = 1; i < pitches.length; i++) assert.ok(Math.abs(pitches[i]! - pitches[i - 1]!) <= 9, `no big leaps: ${pitches}`);
    if (bar.index % PHRASE_BARS === PHRASE_BARS - 1) {
      assert.equal(bar.melody.length, 1, 'one long note to end the phrase');
      const tones = new Set(bar.harmony.map(pitchClass));
      assert.ok(tones.has(pitchClass(bar.melody[0]!.pitch)), 'on the chord');
    }
  }
});

test('it breathes: rests (more at night), plenty of variety, never crowded', () => {
  const rests = (night: boolean) => bars(200, 7, night).filter((b) => b.melody.length === 0).length;
  assert.ok(rests(true) > 15 && rests(true) < 100, `${rests(true)} bars of rest in 200 at night`);
  assert.ok(rests(false) > 2 && rests(false) < rests(true), `${rests(false)} by day`);
  const all = bars(200);
  assert.ok(all.every((b) => b.melody.length <= 5));
  const shapes = new Set(all.map((b) => b.melody.map((n) => `${n.pitch}@${n.at.toFixed(1)}`).join(' ')));
  assert.ok(shapes.size > 60, `${shapes.size} different bars`);
});

test('the same seed plays the same music; day is bright and bouncing, night calm', () => {
  assert.deepEqual(bars(32, 3), bars(32, 3));
  const day = bars(8, 5)[1]!;
  const night = bars(8, 5, true)[1]!;
  assert.equal(day.tempo, 96);
  assert.ok(day.drums && day.bass.length > 0, 'a kick, a shaker and a bass line by day');
  assert.equal(night.tempo, 72);
  assert.equal(night.drums, null, 'no drums at night');
});

test('day turns to night only at the start of a phrase', () => {
  const c = new Composer(9);
  const styles: string[] = [];
  for (let i = 0; i < 12; i++) styles.push(c.next({ night: i >= 5 }).style);
  // Dusk falls in bar 5, mid-phrase: the phrase finishes as day, and night starts at bar 8.
  assert.deepEqual(styles, ['day', 'day', 'day', 'day', 'day', 'day', 'day', 'day', 'night', 'night', 'night', 'night']);
});
