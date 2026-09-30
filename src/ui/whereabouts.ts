// Where the town is (docs/TIME.md#the-calendar), for its sunrise and sunset:
// guessed from your timezone (the main city of the zone), with the clock's
// hours ahead of UTC and whether (and how) they go forward in summer.
import type { Calendar } from '../sim/calendar.ts';

/** A city for each common zone: [latitude, longitude]. */
const ZONES: Record<string, [number, number]> = {
  'Europe/London': [51.5, -0.13],
  'Europe/Dublin': [53.35, -6.26],
  'Europe/Lisbon': [38.72, -9.14],
  'Europe/Paris': [48.86, 2.35],
  'Europe/Brussels': [50.85, 4.35],
  'Europe/Amsterdam': [52.37, 4.9],
  'Europe/Berlin': [52.52, 13.4],
  'Europe/Zurich': [47.37, 8.54],
  'Europe/Madrid': [40.42, -3.7],
  'Europe/Rome': [41.9, 12.5],
  'Europe/Vienna': [48.21, 16.37],
  'Europe/Prague': [50.08, 14.44],
  'Europe/Warsaw': [52.23, 21.01],
  'Europe/Copenhagen': [55.68, 12.57],
  'Europe/Stockholm': [59.33, 18.07],
  'Europe/Oslo': [59.91, 10.75],
  'Europe/Helsinki': [60.17, 24.94],
  'Europe/Athens': [37.98, 23.73],
  'Europe/Istanbul': [41.01, 28.98],
  'America/New_York': [40.71, -74.0],
  'America/Toronto': [43.65, -79.38],
  'America/Chicago': [41.88, -87.63],
  'America/Denver': [39.74, -104.99],
  'America/Phoenix': [33.45, -112.07],
  'America/Los_Angeles': [34.05, -118.24],
  'America/Vancouver': [49.28, -123.12],
  'America/Mexico_City': [19.43, -99.13],
  'America/Sao_Paulo': [-23.55, -46.63],
  'America/Buenos_Aires': [-34.6, -58.38],
  'Asia/Dubai': [25.2, 55.27],
  'Asia/Kolkata': [19.08, 72.88],
  'Asia/Singapore': [1.35, 103.82],
  'Asia/Hong_Kong': [22.32, 114.17],
  'Asia/Shanghai': [31.23, 121.47],
  'Asia/Seoul': [37.57, 126.98],
  'Asia/Tokyo': [35.68, 139.69],
  'Australia/Perth': [-31.95, 115.86],
  'Australia/Sydney': [-33.87, 151.21],
  'Australia/Melbourne': [-37.81, 144.96],
  'Pacific/Auckland': [-36.85, 174.76],
  'Africa/Lagos': [6.52, 3.38],
  'Africa/Cairo': [30.04, 31.24],
  'Africa/Johannesburg': [-26.2, 28.05],
};

/** Your town, where your clock says you are. Zones we don't know go by their hours from UTC. */
export function whereabouts(now = new Date()): Omit<Calendar, 'start'> {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const year = now.getFullYear();
  const winter = -new Date(year, 0, 1).getTimezoneOffset() / 60;
  const summer = -new Date(year, 6, 1).getTimezoneOffset() / 60;
  const utc = Math.min(winter, summer);
  const dst: Calendar['dst'] = winter === summer ? undefined : summer > winter ? (zone.startsWith('America/') ? 'us' : 'eu') : 'south';
  const [latitude, longitude] = ZONES[zone] ?? [dst === 'south' ? -35 : 45, utc * 15];
  return { latitude, longitude, utc, dst };
}

/** A local date as the calendar wants it. */
export function calendarDate(date: Date): Calendar['start'] {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()];
}
