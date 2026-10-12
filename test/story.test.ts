// "What is this?" (src/ui/story.ts, its slides in slides.ts): every slide has its picture, and words for anyone who can't see it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SLIDES } from '../src/ui/slides.ts';

test('every slide in the story has its picture, a title, a line and alt text', () => {
  assert.ok(SLIDES.length >= 4);
  assert.match(SLIDES[0]!.title, /your town/, 'it starts with it being their town');
  for (const slide of SLIDES) {
    assert.ok(existsSync(join(import.meta.dirname, '..', 'public', 'story', slide.image)), slide.image);
    assert.ok(slide.title && slide.text && slide.alt, slide.image);
  }
});
