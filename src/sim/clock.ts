// Sim time (docs/TIME.md). One tick is 6 in-game seconds, so at 1× speed a
// real second is a game minute and a day takes 24 minutes. Day 1 is a Monday.
export const TICKS_PER_SECOND = 10;
export const TICKS_PER_HOUR = 600;
export const TICKS_PER_DAY = TICKS_PER_HOUR * 24;
/** The sim starts at 06:00 on day 1. */
export const START_HOUR = 6;

/** Hours since midnight (0–24, fractional) at a tick. */
export function hourOf(tick: number): number {
  return (START_HOUR + tick / TICKS_PER_HOUR) % 24;
}

/** Zero-based day number at a tick. */
export function dayOf(tick: number): number {
  return Math.floor((START_HOUR * TICKS_PER_HOUR + tick) / TICKS_PER_DAY);
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function weekdayOf(tick: number): string {
  return WEEKDAYS[dayOf(tick) % 7]!;
}

export function isWeekend(tick: number): boolean {
  return dayOf(tick) % 7 >= 5;
}

/** The tick at `hour` (0–24) on zero-based day `day`. */
export function tickAt(day: number, hour: number): number {
  return day * TICKS_PER_DAY + (hour - START_HOUR) * TICKS_PER_HOUR;
}

/** Convert a per-hour rate into a per-tick rate. */
export function perTick(perHour: number): number {
  return perHour / TICKS_PER_HOUR;
}

/** Is `hour` inside [from, to), where the range may wrap past midnight? */
export function between(hour: number, from: number, to: number): boolean {
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** 0 at night, 1 in full daylight, easing through dawn (5–7) and dusk (18–20). */
export function daylight(hour: number): number {
  if (hour < 5 || hour >= 20) return 0;
  if (hour < 7) return (hour - 5) / 2;
  if (hour < 18) return 1;
  return 1 - (hour - 18) / 2;
}

/** "09:30" */
export function formatTime(tick: number): string {
  const hour = hourOf(tick);
  const hh = String(Math.floor(hour)).padStart(2, '0');
  const mm = String(Math.floor((hour % 1) * 60)).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** "Tue 09:30 · Day 2": days counted from `firstDay`, the day the story began (see sim.firstDay). */
export function formatClock(tick: number, firstDay = 0): string {
  return `${weekdayOf(tick)} ${formatTime(tick)} · Day ${dayOf(tick) - firstDay + 1}`;
}
