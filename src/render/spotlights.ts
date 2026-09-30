// Spotlights (docs/FURNITURE.md#spotlights): billboards and posters round town. Each
// spotlight is just an address; its title, line and picture come from the page's Open
// Graph tags, fetched with the site (scripts/spotlights.ts) and pixelated here to fit
// each panel. The panels take turns, a spotlight an hour of game time; a spotlight that
// couldn't be fetched shows officebit's own in its place. Drawn from the clock;
// never touches the story.
import { TICKS_PER_HOUR } from '../sim/clock.ts';

/** The spotlights, in turn. Add an address, and the build fetches the rest. */
export const SPOTLIGHTS: readonly string[] = ['https://vimscoops.dev', 'https://questbar.app', 'https://modest-ui.com'];

/** What's known about a spotlight: fetched with the site into `spotlights/index.json`. */
export interface SpotlightInfo {
  url: string;
  title: string;
  /** Its name: the title without its tagline. */
  name: string;
  description: string;
  /** Its picture, a file beside the index. */
  image: string;
}

/** A spotlight ready to show: its picture once it's loaded. */
export interface Spotlight extends Omit<SpotlightInfo, 'image'> {
  host: string;
  image: HTMLImageElement | null;
  /** officebit's own, shown when a spotlight couldn't be fetched. */
  house?: boolean;
}

/** Colour levels per channel, for the 8-bit look; a picture's shape (width over height) below which it's a logo, framed rather than cropped; and behind a logo with see-through edges, the stage's colour. */
const LEVELS = 6;
const LOGO_SHAPE = 1.3;
const BACKDROP = '#1f1d29';

export class Spotlights {
  private readonly spotlights: Spotlight[];
  private readonly house: Spotlight;
  /** Each spotlight's picture pixelated to each panel size it's shown at. */
  private readonly art = new Map<string, HTMLCanvasElement>();

  /** `base`: the site's root, where `spotlights/` and the house spotlight's picture are. */
  constructor(base: URL) {
    this.house = {
      url: base.href,
      host: base.host,
      title: 'officebit',
      name: 'officebit',
      description: 'A tiny 8-bit town that gets on with its day.',
      image: picture(new URL('og-image.png', base).href),
      house: true,
    };
    this.spotlights = SPOTLIGHTS.map((url) => ({ ...this.house, url, host: new URL(url).host, image: null, house: true }));
    void fetch(new URL('spotlights/index.json', base))
      .then((r): Promise<Record<string, SpotlightInfo>> | Record<string, SpotlightInfo> => (r.ok ? r.json() : {}))
      .then((index) => {
        for (const [i, url] of SPOTLIGHTS.entries()) {
          const info = index[url];
          if (info) this.spotlights[i] = { ...info, host: new URL(url).host, image: picture(new URL(`spotlights/${info.image}`, base).href) };
        }
        this.art.clear();
      })
      .catch(() => {});
  }

  /** The spotlight on a panel at a tick: each panel (by its place in town) a turn behind the one before, a new one each hour. The house spotlight in place of any that couldn't be fetched. */
  at(panel: number, tick: number): Spotlight {
    const spot = this.spotlights[turnOf(panel, tick, this.spotlights.length)] ?? this.house;
    return spot.house ? this.house : spot;
  }

  /** A spotlight's picture, pixelated to a panel `w`×`h` pixels, or null while it loads. */
  pixels(spot: Spotlight, w: number, h: number): HTMLCanvasElement | null {
    const image = spot.image;
    if (!image?.complete || !image.naturalWidth) return null;
    const key = `${image.src}|${w}x${h}`;
    let art = this.art.get(key);
    if (!art) {
      art = pixelate(image, w, h);
      this.art.set(key, art);
    }
    return art;
  }
}

/** A logo's background: the colour just inside its edge (a corner, then the middle of each side), if it's solid there. */
function backdrop(image: HTMLImageElement): string {
  const size = 16;
  const probe = document.createElement('canvas');
  probe.width = probe.height = size;
  const ctx = probe.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, size, size);
  for (const [x, y] of [[0, 0], [1, size / 2], [size / 2, 1], [size - 2, size / 2]] as const) {
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    if (a! > 200) return `rgb(${r},${g},${b})`;
  }
  return BACKDROP;
}

/** Which of `count` spotlights a panel shows at a tick: the next each game hour, each panel one ahead of the one before. */
export function turnOf(panel: number, tick: number, count: number): number {
  return count ? (Math.floor(tick / TICKS_PER_HOUR) + panel) % count : 0;
}

function picture(src: string): HTMLImageElement {
  const image = new Image();
  image.src = src;
  return image;
}

/** Shrunk to the panel (a banner cropped to fill it, a logo framed on its own background colour), then down to a few colours. */
function pixelate(image: HTMLImageElement, w: number, h: number): HTMLCanvasElement {
  const art = document.createElement('canvas');
  art.width = w;
  art.height = h;
  const ctx = art.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  const [iw, ih] = [image.naturalWidth, image.naturalHeight];
  if (iw / ih < LOGO_SHAPE && w / h > LOGO_SHAPE) {
    // A logo: its own background colour behind it, and the whole of it in the middle.
    ctx.fillStyle = backdrop(image);
    ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w / iw, h / ih) * 0.9;
    ctx.drawImage(image, (w - iw * scale) / 2, (h - ih * scale) / 2, iw * scale, ih * scale);
  } else {
    const scale = Math.max(w / iw, h / ih);
    const [sw, sh] = [w / scale, h / scale];
    ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
  }
  const data = ctx.getImageData(0, 0, w, h);
  const step = 255 / (LEVELS - 1);
  for (let i = 0; i < data.data.length; i += 4) {
    for (let c = 0; c < 3; c++) data.data[i + c] = Math.round(data.data[i + c]! / step) * step;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return art;
}
