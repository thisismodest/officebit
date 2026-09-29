// Daily routines (docs/TIME.md). Each person's hours come from their traits:
// diligent people start early and stay late; chaotic ones roll in late and
// stay up. A little per-person jitter keeps everyone from moving in lockstep.
import { between } from './clock.ts';
import type { Traits } from './personality.ts';
import { Rng } from './rng.ts';

export interface Routine {
  wake: number;
  /** Leave home for work. */
  commute: number;
  /** Leave work for home. */
  leave: number;
  bed: number;
}

/** Extra hours in bed at the weekend. */
const LIE_IN = 1.5;
/** Shift workers set off this many hours before their shift starts, so they're in on time: the town's a fair walk. */
const SHIFT_LEAD = 1.25;

/** What part of the day it is for someone. */
export type DayPhase = 'sleep' | 'home' | 'work';

export function routineFor(traits: Traits, seed: number): Routine {
  const rng = new Rng(seed);
  const jitter = () => rng.range(-0.4, 0.4);
  const wake = 6.5 + (1 - traits.diligence) * 1.2 + traits.chaos * 0.5 + jitter();
  const commute = wake + 1 + jitter() / 2;
  const leave = commute + 8.5 + traits.diligence * 1.2 - traits.chaos * 0.6 + jitter();
  // Chaotic people stay up; ambitious ones burn the midnight oil on side projects.
  const bed = 22.5 + traits.chaos * 1.2 + traits.ambition * 0.8 - traits.diligence * 0.5 + jitter();
  return { wake, commute, leave, bed: bed % 24 };
}

/** Weekends: no work, a lie-in, a later night. */
export function phaseAt(routine: Routine, hour: number, weekend = false): DayPhase {
  const wake = wakeHour(routine, weekend);
  const bed = weekend ? (routine.bed + 1) % 24 : routine.bed;
  if (between(hour, bed, wake)) return 'sleep';
  if (!weekend && between(hour, routine.commute, routine.leave)) return 'work';
  return 'home';
}

export function wakeHour(routine: Routine, weekend: boolean): number {
  return weekend ? routine.wake + LIE_IN : routine.wake;
}

/** A shift worker's day, built around their shift: up a couple of hours before, off in good time, bed a few hours after. */
export function shiftRoutine([start, end]: [number, number]): Routine {
  const at = (h: number) => (h + 24) % 24;
  return { wake: at(start - SHIFT_LEAD - 1.5), commute: at(start - SHIFT_LEAD), leave: at(end), bed: at(end + 5) };
}

/** School days: up before seven, out of the door by quarter to eight for the walk in, home time at quarter past three, bed by eight or so. */
export function schoolRoutine(seed: number): Routine {
  const rng = new Rng(seed);
  const wake = 6.6 + rng.range(0, 0.3);
  return { wake, commute: 7.75, leave: 15.25, bed: 19.5 + rng.range(0, 0.8) };
}

/** NPCs keep house hours: no commute. */
export function homebodyRoutine(seed: number): Routine {
  const rng = new Rng(seed);
  const wake = 7 + rng.range(-0.5, 1);
  return { wake, commute: wake, leave: wake, bed: 22 + rng.range(0, 1.5) };
}
