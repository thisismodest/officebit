// Holidays (docs/TIME.md#holidays): the days of the year with fixed dates,
// the bank holidays among them (with a weekday off instead when one falls at a
// weekend, the UK way), Christmas's decorations, and the office party. Pure
// date arithmetic over calendar.ts; what happens on them is festivities.ts.
import { civilFromDays, daysFromCivil, weekdayOfDate, type CalendarDate } from './calendar.ts';

export type HolidayId = 'valentines' | 'aprilFools' | 'midsummer' | 'halloween' | 'bonfireNight' | 'christmasEve' | 'christmas' | 'boxingDay' | 'newYearsEve' | 'newYearsDay';

export interface Holiday {
  id: HolidayId;
  name: string;
  /** Offices and schools shut, like a Sunday. */
  bank?: boolean;
}

/** By month and day. */
const FIXED: Record<string, Holiday> = {
  '1-1': { id: 'newYearsDay', name: "New Year's Day", bank: true },
  '2-14': { id: 'valentines', name: "Valentine's Day" },
  '4-1': { id: 'aprilFools', name: "April Fools' Day" },
  '6-21': { id: 'midsummer', name: 'Midsummer' },
  '10-31': { id: 'halloween', name: 'Halloween' },
  '11-5': { id: 'bonfireNight', name: 'Bonfire Night' },
  '12-24': { id: 'christmasEve', name: 'Christmas Eve' },
  '12-25': { id: 'christmas', name: 'Christmas Day', bank: true },
  '12-26': { id: 'boxingDay', name: 'Boxing Day', bank: true },
  '12-31': { id: 'newYearsEve', name: "New Year's Eve" },
};

/** Christmas lights and the tree on the Green: from 1 December to Twelfth Night. */
const FESTIVE: [from: [number, number], to: [number, number]] = [
  [12, 1],
  [1, 5],
];

/** The holiday a date is, if any. */
export function holidayOn(date: CalendarDate): Holiday | undefined {
  return FIXED[`${date.month}-${date.day}`];
}

/** A bank holiday, or the weekday off in place of one that fell at the weekend. */
export function bankHoliday(date: CalendarDate): boolean {
  return bankHolidays(date.year).includes(daysFromCivil(date.year, date.month, date.day));
}

/** The year's bank holidays (as days since 1970), each moved on to the next free weekday if it falls at a weekend. */
function bankHolidays(year: number): number[] {
  const days: number[] = [];
  for (const [month, day] of [
    [1, 1],
    [12, 25],
    [12, 26],
  ] as const) {
    let on = daysFromCivil(year, month, day);
    while (weekdayOfDate(civilFromDays(on)) >= 5 || days.includes(on)) on++;
    days.push(on);
  }
  // Christmas and Boxing Day themselves are off even when they're at a weekend.
  return [...days, daysFromCivil(year, 12, 25), daysFromCivil(year, 12, 26)];
}

/** Are the Christmas decorations up? */
export function festive({ month, day }: CalendarDate): boolean {
  const [[fromMonth, fromDay], [toMonth, toDay]] = FESTIVE;
  return (month === fromMonth && day >= fromDay) || (month === toMonth && day <= toDay);
}

/** The office Christmas party: the last working day before Christmas. */
export function partyDay(date: CalendarDate): boolean {
  let on = daysFromCivil(date.year, 12, 24);
  while (weekdayOfDate(civilFromDays(on)) >= 5 || bankHoliday(civilFromDays(on))) on--;
  return on === daysFromCivil(date.year, date.month, date.day);
}
