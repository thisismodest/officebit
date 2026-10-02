// Needs (docs/NEEDS.md): four 0–1 meters that drain over time. Furniture and
// activities refill them; the brain acts on whichever is most urgent.
import { perTick } from './clock.ts';
import type { Traits } from './personality.ts';

export type Need = 'energy' | 'hunger' | 'social' | 'fun';
export const NEEDS: readonly Need[] = ['energy', 'hunger', 'social', 'fun'];
export type Needs = Record<Need, number>;

export type Activity = 'awake' | 'working' | 'asleep';

/** Meals' worth of ingredients a well-stocked home kitchen holds. */
export const PANTRY_FULL = 14;
/** Meals left at home before the food shop comes on the list. */
export const SHOP_WHEN = 4;

/** Base drain per game hour while awake. */
const DRAIN: Needs = { energy: 0.08, hunger: 0.09, social: 0.18, fun: 0.15 };
/** Energy restored per hour of sleep. */
const SLEEP_RATE = 0.14;
/** Asleep, the other needs drain at this fraction of the waking rate. */
const ASLEEP_DRAIN = 0.3;

/** Drain (or, asleep, restore energy) over `ticks` of game time. */
export function drain(needs: Needs, traits: Traits, activity: Activity, ticks = 1): void {
  const pace = activity === 'asleep' ? ASLEEP_DRAIN : 1;
  const over = (perHour: number) => perTick(perHour) * ticks;
  if (activity === 'asleep') needs.energy += over(SLEEP_RATE);
  else needs.energy -= over(DRAIN.energy * (activity === 'working' ? 1.3 : 1));
  needs.hunger -= over(DRAIN.hunger * pace);
  // Social people need company sooner; chaotic people get bored sooner.
  needs.social -= over(DRAIN.social * (0.2 + traits.social) * pace);
  needs.fun -= over(DRAIN.fun * (0.2 + traits.chaos) * pace);
  for (const need of NEEDS) needs[need] = Math.min(1, Math.max(0, needs[need]));
}

export function restore(needs: Needs, need: Need, amount: number): void {
  needs[need] = Math.min(1, needs[need] + amount);
}

/** How pressing a need is: 0 when full, 1 when empty, rising steeply. */
export function urgency(needs: Needs, need: Need): number {
  return (1 - needs[need]) ** 2;
}
