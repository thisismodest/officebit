// Small line icons (16×16, drawn in the text colour) for the floating controls,
// the editor, the tabs and the World overview, so things can be a symbol (with a
// tooltip) rather than a word or an emoji.
const PATHS = {
  town: 'M2 7.5 8 2.5l6 5M3.5 6.5V13.5h9V6.5M6.5 13.5v-4h3v4',
  back: 'M13 8H3M7 4 3 8l4 4',
  visit: 'M9 2.5h4.5v11H9M2 8h8M7 5l3 3-3 3',
  more: 'M3 8h1M7.5 8h1M12 8h1',
  undo: 'M6 3.5 2.5 7 6 10.5M3 7h6.5a3.5 3.5 0 0 1 0 7H8',
  edit: 'M10.5 2.5l3 3-8 8H2.5v-3zM9 4l3 3',
  share: 'M8 2v8M5 5l3-3 3 3M3 9v4.5h10V9',
  settings: 'M8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM8 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06',
  help: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.2 6.3a1.9 1.9 0 1 1 2.6 1.7c-.5.2-.8.6-.8 1.1v.4M8 11.4v.2',
  move: 'M8 1.5v13M1.5 8h13M8 1.5 6 3.5M8 1.5l2 2M8 14.5l-2-2M8 14.5l2-2M1.5 8l2-2M1.5 8l2 2M14.5 8l-2-2M14.5 8l-2 2',
  add: 'M8 3v10M3 8h10',
  road: 'M5 2 3 14M11 2l2 12M8 2.5v2M8 7v2M8 11.5v2',
  pavement: 'M2 2.5v11M5.5 2.5v11M5.5 5h-3.5M5.5 9h-3.5M9 2.5l-1 11M14 2.5l1 11',
  path: 'M3.5 14c1-3 4.5-3 4.5-6S5 4 6 2M8.5 14c1-3 4.5-3 4.5-6s-3-4-2-6',
  crossing: 'M2.5 3.5h11v9h-11zM5 3.5v9M8 3.5v9M11 3.5v9',
  forecourt: 'M2.5 2.5h11v11h-11zM2.5 8h11M8 2.5v11',
  grass: 'M2 13.5h12M3.5 13.5l1-4M6 13.5l-.5-5M8 13.5l.5-6M10.5 13.5l-.5-4.5M12.5 13.5l.5-3.5',
  sand: 'M1.5 12.5c3-2 5-2 8 0s3.5 1 5-.5M4 9.5h.01M7 8h.01M10 9.5h.01M12 7.5h.01',
  runway: 'M5.5 1.5v13M10.5 1.5v13M8 2.5v2M8 7v2M8 11.5v2',
  apron: 'M2.5 2.5h11v11h-11zM5 5h6v4H5z',
  shallows: 'M1.5 9.5c1.5-1.3 3-1.3 4.3 0s2.8 1.3 4.3 0 3-1.3 4.4 0M1.5 13h13M3 6h.01M8 5h.01M13 6h.01',
  water: 'M1.5 5.5c1.5-1.3 3-1.3 4.3 0s2.8 1.3 4.3 0 3-1.3 4.4 0M1.5 9.5c1.5-1.3 3-1.3 4.3 0s2.8 1.3 4.3 0 3-1.3 4.4 0M1.5 13c1.5-1.3 3-1.3 4.3 0s2.8 1.3 4.3 0 3-1.3 4.4 0',
  erase: 'M9.5 2.5l4 4-6.5 6.5H3.5l-1-1 7-9.5zM6 6l4 4M8 13.5h5.5',
  flip: 'M5 2.5v11M2.5 5 5 2.5 7.5 5M11 13.5v-11M8.5 11l2.5 2.5 2.5-2.5',
  room: 'M2.5 2.5h11v11h-11zM8 2.5v4M8 9.5v4M8 8h5.5',
  area: 'M2.5 2.5h2M6.5 2.5h3M11.5 2.5h2v2M13.5 6.5v3M13.5 11.5v2h-2M9.5 13.5h-3M4.5 13.5h-2v-2M2.5 9.5v-3M2.5 4.5v-2',
  door: 'M4 14V2.5h8V14M2 14h12M9.5 8.5h.5',
  stairs: 'M2.5 13.5h3v-3h3v-3h3v-3h2',
  fullscreen: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
  unfullscreen: 'M6 2.5V6H2.5M13.5 6H10V2.5M10 13.5V10h3.5M2.5 10H6v3.5',
  follow: 'M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  control: 'M8 1.75a6.25 6.25 0 1 0 0 12.5 6.25 6.25 0 0 0 0-12.5zM8 6.25a1.75 1.75 0 1 0 0 3.5 1.75 1.75 0 0 0 0-3.5zM2 7.25l4.4.5M14 7.25l-4.4.5M8 9.75v4.5',
  trash: 'M3 4.5h10M6.5 4.5V2.5h3v2M4.5 4.5l.5 9h6l.5-9M7 7v4M9 7v4',
  done: 'M3 8.5 6.5 12 13 4.5',
  close: 'M4 4l8 8M12 4l-8 8',
  play: 'M5 3.5v9l7-4.5z',
  speed: 'M2.5 4v8l5-4zM8.5 4v8l5-4z',
  minus: 'M3 8h10',
  sound: 'M2.5 6h2.5l3-2.5v9L5 10H2.5zM10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9',
  muted: 'M2.5 6h2.5l3-2.5v9L5 10H2.5zM10.5 6l3.5 4M14 6l-3.5 4',
  pause: 'M5.5 3.5v9M10.5 3.5v9',
  sidebar: 'M2 3h12v10H2zM10 3v10M11.5 5.5h1M11.5 7.5h1M11.5 9.5h1',
  world: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM1.5 8h13M8 1.5c2 2 2.5 4.2 2.5 6.5S10 12.5 8 14.5C6 12.5 5.5 10.3 5.5 8S6 3.5 8 1.5',
  people: 'M6 7a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM1.5 14c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5M11 2.2a2.5 2.5 0 0 1 0 4.6M12.5 9.8c1.2.6 2 2 2 3.7',
  news: 'M2.5 3.5h9v10h-8a1 1 0 0 1-1-1zM11.5 6h2v6.5a1 1 0 0 1-2 0M4.5 6h5M4.5 8.5h5M4.5 11h3',
  // The World overview: the day, and kinds of place.
  workday: 'M2.5 5.5h11v7.5h-11zM6 5.5v-2h4v2M2.5 8.5h11',
  weekend: 'M2 8.5v4h12v-4M3.5 8.5V6a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v2.5M2 8.5a1 1 0 0 1 2 0V10h8V8.5a1 1 0 0 1 2 0M3.5 12.5v1M12.5 12.5v1',
  awake: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1',
  asleep: 'M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z',
  cloud: 'M4.5 12h7a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.8-.7A2.6 2.6 0 0 0 4.5 12z',
  rain: 'M4.5 9.5h7a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.8-.7A2.6 2.6 0 0 0 4.5 9.5zM5.5 11.5l-.5 2M8.5 11.5l-.5 2M11.5 11.5l-.5 2',
  snow: 'M4.5 9.5h7a2.5 2.5 0 0 0 0-5 3.5 3.5 0 0 0-6.8-.7A2.6 2.6 0 0 0 4.5 9.5zM5 12.5h.01M8 13.5h.01M11 12.5h.01',
  office: 'M3 14V2.5h7V14M10 6h3v8M1.5 14h13M5 5h1M7 5h1M5 7.5h1M7 7.5h1M5 10h1M7 10h1',
  cart: 'M1.5 2.5h2l1.5 8h7l1.5-5.5H4.3M6.5 13.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM12 13.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
  school: 'M1.5 6 8 3l6.5 3L8 9zM4 7.2v3.3c0 1 1.8 2 4 2s4-1 4-2V7.2M14.5 6v4',
  swim: 'M1.5 11c1.5-1.3 3-1.3 4.3 0s2.8 1.3 4.3 0 3-1.3 4.4 0M1.5 14c1.5-1.3 3-1.3 4.3 0s2.8 1.3 4.3 0 3-1.3 4.4 0M10.5 4.5a1.5 1.5 0 1 0 0-.01M4 9l3-4 3 2',
  cup: 'M3 6h8v4.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM11 7h1.5a1.5 1.5 0 0 1 0 3H11M5.5 2.5v2M8.5 2.5v2',
  rocket: 'M9.5 2.5h4v4L9 11 5 7zM5 7l-2.5.5L4 9M9 11l-.5 2.5L7 12M5.5 10.5 3 13',
  building: 'M6.5 2.5h3l3 10h-9zM5.2 7h5.6M4.4 10h7.2M2 12.5h12',
  home: 'M2.5 7.5 8 3l5.5 4.5M4 6.5v7h8v-7M7 13.5v-3h2v3M11 5V3h1.5v3.2',
  pizza: 'M3 3.5c3.5-1.5 6.5-1.5 10 0L8 14zM4.5 5.5c2.4-.8 4.6-.8 7 0M7.3 8a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0zM9.8 10a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0z',
  bell: 'M4 11V7.5a4 4 0 0 1 8 0V11l1 1.5H3zM6.5 14h3',
} as const;

export type IconName = keyof typeof PATHS;

export function isIcon(name: string | undefined): name is IconName {
  return !!name && name in PATHS;
}

/** An icon as inline SVG. Buttons carry the label (aria-label and title); the icon itself is decoration. */
export function icon(name: IconName): string {
  return `<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="${PATHS[name]}"/></svg>`;
}

/** A square icon button with its label as a tooltip. */
export function iconButton(name: IconName, label: string, attributes = ''): string {
  return `<button type="button" class="icon-button mdst-button--sm" aria-label="${label}" title="${label}" ${attributes}>${icon(name)}</button>`;
}
