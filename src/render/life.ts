// Little signs of life while people are still (docs/RENDERING.md#signs-of-life): a glance round and a look at their phone
// while they stand about, a chat's bubble taking turns between the two of them, a cup raised at the table, and the TV's
// glow and a controller on the sofa. Drawn from who they are and the clock, never the story.
import type { Person } from '../sim/person.ts';
import type { Simulation } from '../sim/sim.ts';
import type { Facing, Pose } from './characters.ts';
import { OUTLINE, hashString } from './palette.ts';
import { rect, type Ctx } from './pixels.ts';

/** Standing about with nothing in particular to do: these are when they glance round and check their phone. */
const STANDING_ABOUT = new Set(['wander', 'stroll', 'queue', 'retreat']);
/** A glance round: every so often (ms, between these, by person), for this long. */
const GLANCE = { every: [4000, 9000], lasts: 1200 };
/** The phone out: every other one of these spells (ms), for this share of it. */
const PHONE = { every: 14000, share: 0.4 };
/** A chat: each turn to speak (ms), how much of it their bubble shows, and what they might be on about. */
const CHAT = { turn: 2600, shown: 0.7 };
const SAID = ['💬', '😂', '☕', '⚽', '👍', '🍕', '☀️', '🎵', '💡', '🙌', '🤔', '❤️'];
/** A cup raised at the table: every so often (ms), for this long. */
const CUP = { every: 9000, lasts: 1600 };

/** Standing about, now and then they look round: a way to face for a moment, or null to face as they are. */
export function glance(p: Person, pose: Pose, time: number): Facing | null {
  if (!standingAbout(p, pose)) return null;
  const h = hashString(p.id);
  const every = GLANCE.every[0]! + h * (GLANCE.every[1]! - GLANCE.every[0]!);
  const spell = time / every + h * 7;
  if ((spell % 1) * every > GLANCE.lasts) return null;
  const ways = (['down', 'left', 'right', 'up'] as const).filter((f) => f !== p.facing);
  return ways[(Math.floor(spell) + Math.floor(h * 10)) % ways.length]!;
}

/** Two people chatting take turns to speak: what's in the bubble over `p` (whatever they're on about), or null while it's
 * the other's turn. */
export function chatTurn(p: Person, other: string, time: number): string | null {
  const pair = [p.id, other].sort();
  const k = hashString(pair.join('|'));
  const turn = time / CHAT.turn + k * 5;
  if (pair[Math.floor(turn) % 2] !== p.id || turn % 1 >= CHAT.shown) return null;
  return SAID[(Math.floor(turn) * 7 + Math.floor(k * 97)) % SAID.length]!;
}

/**
 * The signs of life round someone just drawn: `x` their sprite's left, `feet` where they stand, `head` the top of their
 * head (world pixels), `facing` as drawn.
 */
export function paintLife(ctx: Ctx, sim: Simulation, p: Person, pose: Pose, facing: Facing, x: number, feet: number, head: number, time: number): void {
  const h = hashString(p.id);
  const intent = p.intent;
  // Their phone out, now and then, standing about (grown-ups, facing us: side on, it doesn't read as a phone).
  if (standingAbout(p, pose) && p.role !== 'child' && facing === 'down' && !glance(p, pose, time)) {
    const spell = time / PHONE.every + h * 3;
    if (Math.floor(spell) % 2 === 0 && spell % 1 < PHONE.share) {
      rect(ctx, x + 4, feet - 11, 3, 4, OUTLINE);
      rect(ctx, x + 5, feet - 10, 1, 2, '#9fd3f0');
    }
  }
  if (intent?.kind !== 'use' || p.phase !== 'doing') return;
  // On the sofa in front of the TV: its glow flickering on them, and a controller out for a game.
  if (pose === 'sitSofa' && (intent.mode === 'games' || intent.mode === 'takeaway')) {
    const flicker = 0.08 + 0.07 * Math.abs(Math.sin(time / 170 + h * 9) * Math.sin(time / 430));
    rect(ctx, x, head, 12, feet - 6 - head, `rgba(130, 180, 255, ${flicker.toFixed(3)})`);
    if (intent.mode === 'games') {
      rect(ctx, x + 3, feet - 10, 6, 3, OUTLINE);
      rect(ctx, x + 4, feet - 9, 1, 1, Math.floor(time / 300) % 2 ? '#e94f4f' : '#5fb35a');
    }
  }
  // At the table with something to eat or drink: a cup raised now and then.
  const item = sim.items[intent.item];
  if (pose === 'sitSofa' && item?.type.offers?.hunger && !intent.mode) {
    const into = (time + h * CUP.every) % CUP.every;
    if (into < CUP.lasts) {
      rect(ctx, x + 7, head + 6, 4, 4, OUTLINE);
      rect(ctx, x + 8, head + 7, 2, 2, '#f4f4f0');
      rect(ctx, x + 8, head + 7, 2, 1, '#8a5a3a');
    }
  }
}

function standingAbout(p: Person, pose: Pose): boolean {
  return pose === 'stand' && p.phase === 'doing' && STANDING_ABOUT.has(p.intent?.kind ?? '');
}
