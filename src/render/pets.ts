// Pet sprites (docs/PEOPLE.md#family-and-pets). Side-on, facing right;
// mirrored for left. Up/down reuse the side view.
//
//   o outline  f fur  F fur shadow  E ear  e eye  n nose  w white
import { EYE, FUR, OUTLINE, shade } from './palette.ts';
import { canvas, paintAscii } from './pixels.ts';
import type { Facing } from './characters.ts';

export type PetPose = 'stand' | 'walk' | 'sleep';

/** Templates may be narrower; rows are padded to this so mirroring lines up. */
export const PET_W = 13;
export const PET_H = 9;

export const CAT: Record<PetPose, string[]> = {
  stand: [
    '.......o..o.',
    'o.....offffo',
    'o.....offefo',
    '.ooooofffffn',
    '.offfffffoo.',
    '.ofFfffFffo.',
    '.oFFFFFFFFo.',
    '..ofo..ofo..',
    '..ooo..ooo..',
  ],
  walk: [
    '.......o..o.',
    'o.....offffo',
    'o.....offefo',
    '.ooooofffffn',
    '.offfffffoo.',
    '.ofFfffFffo.',
    '.oFFFFFFFFo.',
    '.ofo....ofo.',
    '.oo......oo.',
  ],
  sleep: [
    '............',
    '............',
    '.......o..o.',
    '......offffo',
    '.ooooofffFfo',
    'offfffffffno',
    'ofFfffFfffo.',
    'oFFFFFFFFFo.',
    '.oooooooooo.',
  ],
};

export const DOG: Record<PetPose, string[]> = {
  stand: [
    '.......oooo.',
    'o.....offffo',
    'o....oEEfefo',
    '.o...oEEffffn',
    '.oooooEoffoo',
    '.offfffffo..',
    '.oFfffFffo..',
    '.ofo...ofo..',
    '.ooo...ooo..',
  ],
  walk: [
    '.......oooo.',
    '.o....offffo',
    'o....oEEfefo',
    '.o...oEEffffn',
    '.oooooEoffoo',
    '.offfffffo..',
    '.oFfffFffo..',
    'ofo.....ofo.',
    'oo.......oo.',
  ],
  sleep: [
    '............',
    '............',
    '............',
    '......oooo..',
    '.oooooEEffo.',
    'offfffEEffno',
    'ofFfffffffo.',
    'oFFFFFFFFFo.',
    '.oooooooooo.',
  ],
};

const cache = new Map<string, HTMLCanvasElement>();

export function petSprite(species: 'cat' | 'dog', fur: number, facing: Facing, pose: PetPose): HTMLCanvasElement {
  const key = `${species}.${fur}|${facing}|${pose}`;
  let sprite = cache.get(key);
  if (!sprite) {
    const base = FUR[fur] ?? FUR[0]!;
    const colors: Record<string, string> = {
      o: OUTLINE,
      f: base,
      F: shade(base, -0.2),
      E: shade(base, -0.35),
      e: pose === 'sleep' ? shade(base, -0.4) : EYE,
      n: species === 'cat' ? '#e98fb3' : OUTLINE,
      w: '#ffffff',
    };
    const rows = (species === 'cat' ? CAT : DOG)[pose].map((row) => row.padEnd(PET_W, '.'));
    const { canvas: c, ctx } = canvas(PET_W, PET_H);
    paintAscii(ctx, rows, colors, 0, 0, facing === 'left');
    sprite = c;
    cache.set(key, sprite);
  }
  return sprite;
}
