// A person's runtime state (docs/PEOPLE.md), and the intents a brain can choose.
import type { ExternalStatus } from '../feeds/protocol.ts';
import type { Leg } from './navigation.ts';
import type { Needs } from './needs.ts';
import type { Traits } from './personality.ts';
import type { Routine } from './schedule.ts';
import { hashOf } from './rng.ts';
import type { NpcRole, Place, Species } from './world.ts';

/** Ways to use a sofa at home: with a takeaway, or with a games controller. */
export type UseMode = 'takeaway' | 'games';

export type Intent =
  | { kind: 'work' }
  | { kind: 'use'; item: number; mode?: UseMode }
  | { kind: 'hustle'; item: number }
  | { kind: 'chat'; with: string }
  | { kind: 'wander'; to: Place }
  | { kind: 'retreat'; to: Place }
  /** A swim in the shallows off a beach (intents.ts). */
  | { kind: 'swim'; to: Place }
  | { kind: 'stroll'; to: Place }
  | { kind: 'meeting'; level: string; room: number }
  | { kind: 'sleep'; item: number; until: number }
  /** Wait outside a venue that should be open by now, for up to `wait` ticks once there (then give up). */
  | { kind: 'queue'; level: string; wait: number }
  | { kind: 'leave' }
  /** A game in the park with friends (catch, frisbee): at their place in the ring, for a plan (plans.ts). */
  | { kind: 'play'; plan: number; spot: Place }
  /** By bus (buses.ts): to the stop `from` (an item), wait for the bus going round `run` (0 or 1: which way), ride to `to`, then carry on with `after`. */
  | { kind: 'bus'; from: number; to: number; run: number; after: Intent }
  /** By car (cars.ts): to their car, drive to the bay `to` (an item), then carry on with `after`. */
  | { kind: 'drive'; to: number; after: Intent }
  /** By plane (planes.ts): to the gate `from` (an item), wait for the plane, fly to the gate `to`, then carry on with `after`. */
  | { kind: 'fly'; from: number; to: number; after: Intent };

export interface Person {
  readonly id: string;
  name: string;
  readonly species: Species;
  /** Not on the team: family, pets, staff, crews, children and so on (roles.ts says what each does). */
  readonly npc: boolean;
  look: readonly number[];
  dept?: string;
  /** Employer id. Changes when someone quits, is let go, or starts a venture. */
  company?: string;
  /** Where they walked out of, if they're between jobs and might be taken back. */
  formerCompany?: string;
  /** Where they last worked. They don't apply there again, unless they walked out (`formerCompany`). */
  leftCompany?: string;
  /** When they started their current job (new starters get a week's grace at review). */
  hiredAt: number;
  /** Id of the venture they're part of, if any. */
  venture?: string;
  /** Hours spent hustling on an idea that isn't a venture yet. */
  ideas: number;
  /** When they last had a takeaway (a treat, not a habit). */
  lastTakeaway: number;
  /** When they last went out to a venue, and when staff last served them. */
  lastOuting: number;
  lastServed: number;
  /** When they last gave up waiting outside somewhere (they won't queue again for a while). */
  lastGaveUp: number;
  home?: string;
  /** Staff keep a venue running round the clock; crews build things. */
  /** On a bus (its car's id), out of sight till their stop (buses.ts). */
  riding?: string;
  readonly role?: NpcRole;
  /** Staff: the venue they work at (the pilot's moves with the plane: planes.ts). */
  works?: string;
  /** Flies the plane. */
  readonly flies?: boolean;
  /** Hours they work every day, weekends too, if they work shifts. */
  readonly shift?: [start: number, end: number];
  /** The days of the week they work their shift (0 is Monday); every day, unless it says. */
  readonly days?: readonly number[];
  /** Has a car of their own (cars.ts). */
  readonly car?: boolean;
  preset: string;
  traits: Traits;
  routine: Routine;
  level: string;
  /** Position in tiles, and last tick's position (for render interpolation). */
  x: number;
  y: number;
  px: number;
  py: number;
  facing: 'up' | 'down' | 'left' | 'right';
  needs: Needs;
  /** Builds while working uninterrupted. */
  focus: number;
  intent: Intent | null;
  phase: 'moving' | 'doing';
  timer: number;
  route: Leg[];
  dest: Place | null;
  spot: { item: number; spot: number } | null;
  /** Per-tick need gains from the current activity. */
  gains: Partial<Needs>;
  /** Index of their workstation in sim.items, or -1. */
  desk: number;
  /** A baby on hands and knees, from the car to the front door: slow, and low down. */
  crawling?: boolean;
  /** The plan they're in today, if any (plans.ts). */
  plan?: number;
  /** Leaving town for good: off to the edge of it, then gone. */
  leaving?: boolean;
  /** Steps spent waiting behind someone (movement.ts `giveWay`): after a while they squeeze past. */
  held?: number;
  /** How far (tiles) they've stepped to their left to pass someone coming the other way: drawing only. */
  aside?: number;
  /** Offstage: people without a home, outside working hours. */
  hidden: boolean;
  /** Ticks left passing through a door or up the stairs. */
  transit: number;
  /** Catching up out of sight (sim.brisk): steps till they're at the end of this leg of their walk. */
  walkLeft?: number;
  /** Ticks left of being knocked off-task by someone. */
  distracted: number;
  talkingTo: string | null;
  /** A fire drill: where to wait, and until when. */
  muster?: { to: Place; until: number };
  /** A date night: with whom, until when (game ticks), and whether it's been in the news. */
  date?: { with: string; until: number; noticed?: boolean };
  status: ExternalStatus;
  /** Running totals; `week*` reset at each Friday review. */
  stats: { work: number; interruptions: number; interrupted: number; weekWork: number; weekInterrupted: number };
}

export function atDesk(p: Person): boolean {
  return p.intent?.kind === 'work' && p.phase === 'doing';
}

export function asleep(p: Person): boolean {
  return p.intent?.kind === 'sleep' && p.phase === 'doing';
}

/** Sat at a desk, whether for the day job or a side project. */
export function seatedAtDesk(p: Person): boolean {
  return (p.intent?.kind === 'work' || p.intent?.kind === 'hustle') && p.phase === 'doing';
}

/** Turn to face a tile. */
export function faceTowards(p: Person, x: number, y: number): void {
  const dx = x - p.x;
  const dy = y - p.y;
  p.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}

/**
 * Someone on their way somewhere this far off (tiles) is out of reach for a
 * chat; nearer than that, but more than `HAIL` away, the one who wants a word
 * hurries to catch them up.
 */
const CATCH_UP = 8;
const HAIL = 2;

/** Is `q` off somewhere, too far ahead of `p` to catch for a chat? */
export function walkingAway(p: Person, q: Person): boolean {
  return q.phase === 'moving' && (q.level !== p.level || Math.hypot(q.x - p.x, q.y - p.y) > CATCH_UP);
}

/** Is `p` hurrying to catch `q` up for a chat: `q` on the move, and not yet within earshot? */
/** The share of people who carry an umbrella in the rain (the rest hurry to get out of it). */
const UMBRELLAS = 0.65;

/** Does someone carry an umbrella? The same for them every time it rains. */
export function hasUmbrella(p: Pick<Person, 'id' | 'species'>, seed: number): boolean {
  return p.species === 'human' && ((hashOf(`umbrella:${p.id}`, seed) >>> 0) % 1000) / 1000 < UMBRELLAS;
}

export function catchingUp(p: Person, q: Person): boolean {
  return q.phase === 'moving' && q.level === p.level && Math.hypot(q.x - p.x, q.y - p.y) > HAIL;
}
