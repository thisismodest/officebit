// The calendar (docs/TIME.md#the-calendar): the date a tick falls on, and
// when the sun's up there. The story's first day has a date (set from your
// clock: Live starts today, Sandbox today or a day you pick) and the town has
// a place (from your timezone). From those, pure arithmetic: no Date, so the
// same town on the same date always tells the same story.
import { dayOf, hourOf } from './clock.ts';

export interface Calendar {
  /** The date of the story's first day (`sim.firstDay`): year, month (1–12), day. */
  start: [year: number, month: number, day: number];
  /** Where the town is, in degrees (north and east positive). */
  latitude: number;
  longitude: number;
  /** Hours ahead of UTC in winter; and, where the clocks go forward, by which rule. */
  utc: number;
  dst?: 'eu' | 'us' | 'south';
}

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** London, from a Monday in June: the town's calendar until the timekeeper sets one. */
export const DEFAULT_CALENDAR: Calendar = { start: [2026, 6, 1], latitude: 51.5, longitude: -0.13, utc: 0, dst: 'eu' };
/** Hours either side of sunrise and sunset that dawn and dusk take. */
const TWILIGHT = 0.75;

/** The date of the day a tick falls on. */
export function dateOf(calendar: Calendar, firstDay: number, tick: number): CalendarDate {
  return civilFromDays(daysFromCivil(...calendar.start) + dayOf(tick) - firstDay);
}

/** Days since 1970-01-01 (proleptic Gregorian), and back. */
export function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function civilFromDays(days: number): CalendarDate {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: era * 400 + yoe + (month <= 2 ? 1 : 0), month, day };
}

/** Monday is 0, as in the sim. */
export function weekdayOfDate({ year, month, day }: CalendarDate): number {
  return (((daysFromCivil(year, month, day) + 3) % 7) + 7) % 7;
}

/** The local clock's hours ahead of UTC on a date: an hour more while the clocks are forward. */
export function utcOffset(calendar: Calendar, date: CalendarDate): number {
  return calendar.utc + (summerTime(calendar.dst, date) ? 1 : 0);
}

/** Sunrise and sunset, in local clock hours (NOAA's approximation); polar night and midnight sun clamp to none or all day. */
export function sunTimes(calendar: Calendar, date: CalendarDate): { rise: number; set: number } {
  const rad = Math.PI / 180;
  const n = daysFromCivil(date.year, date.month, date.day) - daysFromCivil(date.year, 1, 1);
  const g = ((2 * Math.PI) / 365) * n;
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const lat = calendar.latitude * rad;
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const noon = (720 - 4 * calendar.longitude - eqTime) / 60 + utcOffset(calendar, date);
  if (cosHa >= 1) return { rise: noon, set: noon };
  if (cosHa <= -1) return { rise: noon - 12, set: noon + 12 };
  const half = (Math.acos(cosHa) / rad) * 4 / 60;
  return { rise: noon - half, set: noon + half };
}

/** 0 at night, 1 in full daylight, easing through dawn and dusk. */
export function daylightAt(calendar: Calendar, firstDay: number, tick: number): number {
  const { rise, set } = sunTimes(calendar, dateOf(calendar, firstDay, tick));
  const hour = hourOf(tick);
  const up = (hour - (rise - TWILIGHT)) / (2 * TWILIGHT);
  const down = (set + TWILIGHT - hour) / (2 * TWILIGHT);
  return Math.max(0, Math.min(1, up, down));
}

/** Are the clocks forward on this date? By the day (they change at night, so near enough). */
function summerTime(rule: Calendar['dst'], { year, month, day }: CalendarDate): boolean {
  const on = daysFromCivil(year, month, day);
  const sunday = (m: number, which: number) => {
    // The `which`th Sunday of month m (negative counts from the end).
    if (which > 0) {
      const first = daysFromCivil(year, m, 1);
      return first + ((6 - weekdayOfDate(civilFromDays(first)) + 7) % 7) + (which - 1) * 7;
    }
    const last = daysFromCivil(year, m + 1, 1) - 1;
    return last - ((weekdayOfDate(civilFromDays(last)) - 6 + 7) % 7);
  };
  if (rule === 'eu') return on >= sunday(3, -1) && on < sunday(10, -1);
  if (rule === 'us') return on >= sunday(3, 2) && on < sunday(11, 1);
  if (rule === 'south') return on >= sunday(10, 1) || on < sunday(4, 1);
  return false;
}
