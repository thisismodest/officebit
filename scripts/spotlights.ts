// Spotlights (docs/FURNITURE.md#spotlights), fetched with the site: each spotlight's page is
// read for its og:title, og:description and og:image, and the image saved
// alongside, so the town shows them offline and never asks another site for
// anything. A spotlight that can't be fetched is left out, and the town shows its
// own house spotlight in its place.   npm run spotlights   (the build and dev server run it too)
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SPOTLIGHTS, type SpotlightInfo } from '../src/render/spotlights.ts';

/** How long to wait for a spotlight's page or image (ms), and the biggest image worth keeping (bytes). */
const TIMEOUT = 10_000;
const MOST_BYTES = 4_000_000;
const IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
};

/**
 * A spotlight page's title (and its name: the title up to its tagline), line
 * and image address, from its Open Graph tags (or plain ones), and its icons,
 * best first (an apple-touch-icon, a square picture with its own background;
 * then an SVG icon; any other; the site's favicon.ico), all resolved against the page.
 */
export function readMeta(html: string, page: string): { title: string; name: string; description: string; image?: string; icons: string[] } {
  const tags = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => ({
    key: /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase(),
    content: decode(/\bcontent\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? ''),
  }));
  const meta = (...keys: string[]) => keys.map((k) => tags.find((t) => t.key === k)?.content).find(Boolean);
  const title = meta('og:title', 'twitter:title') ?? decode(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '').trim();
  const image = meta('og:image', 'og:image:url', 'twitter:image');
  const full = title || new URL(page).hostname;
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => ({
    rel: /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '',
    href: decode(/\bhref\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? ''),
    svg: /\btype\s*=\s*["']image\/svg\+xml["']/i.test(tag) || /\.svg["'?]/i.test(tag),
  }));
  const icon = (l: { rel: string }) => /\bicon\b/.test(l.rel) && !l.rel.includes('apple');
  const icons = [...links.filter((l) => l.rel.includes('apple-touch-icon')), ...links.filter((l) => icon(l) && l.svg), ...links.filter((l) => icon(l) && !l.svg)].map((l) => l.href);
  return {
    title: full,
    name: nameOf(full),
    description: meta('og:description', 'twitter:description', 'description') ?? '',
    image: image ? new URL(image, page).href : undefined,
    icons: [...new Set([...icons.filter(Boolean).map((href) => new URL(href, page).href), new URL('/favicon.ico', page).href])],
  };
}

/** Fetch every spotlight into `dir`: its image, and `index.json` with what's known about each. */
export async function fetchSpotlights(dir: string, urls: readonly string[] = SPOTLIGHTS): Promise<Record<string, SpotlightInfo>> {
  await mkdir(dir, { recursive: true });
  const index: Record<string, SpotlightInfo> = {};
  for (const url of urls) {
    try {
      const page = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), redirect: 'follow' });
      if (!page.ok) throw new Error(`${page.status}`);
      const meta = readMeta(await page.text(), page.url || url);
      if (!meta.image) throw new Error('no og:image');
      const host = new URL(url).hostname;
      const image = await download(meta.image, dir, host);
      // Its icon, for the posters (portrait: a landscape picture won't fit): the first there is, if any.
      let icon: string | undefined;
      for (const address of meta.icons) {
        icon = await download(address, dir, `${host}-icon`).catch(() => undefined);
        if (icon) break;
      }
      index[url] = { url, title: meta.title, name: meta.name, description: meta.description, image, ...(icon ? { icon } : {}) };
    } catch (error) {
      console.warn(`Spotlight ${url} left out (the town shows its own in its place): ${(error as Error).message}`);
    }
  }
  await writeFile(join(dir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

/** Save a picture into `dir` as `name` (and its kind's extension); throws if it isn't one, or is too big. */
async function download(address: string, dir: string, name: string): Promise<string> {
  const response = await fetch(address, { signal: AbortSignal.timeout(TIMEOUT) });
  const ext = IMAGE_TYPES[(response.headers.get('content-type') ?? '').split(';')[0]!.trim()];
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || !ext || bytes.length > MOST_BYTES) throw new Error(`image: ${response.status} ${ext ?? 'not an image'}`);
  const file = `${name}.${ext}`;
  await writeFile(join(dir, file), bytes);
  return file;
}

/** A title's name: up to the first " | ", " – ", ": " or ", " (QuestBar: Your quest… is QuestBar), if that leaves one. */
function nameOf(title: string): string {
  const cut = /\s+[|–—-]\s+|:\s+|,\s+/.exec(title);
  const name = cut ? title.slice(0, cut.index).trim() : title;
  return name.length >= 2 ? name : title;
}

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" })[e]!);
}

if (import.meta.main) {
  const dir = process.argv[2] ?? join('.cache', 'spotlights');
  const index = await fetchSpotlights(dir);
  console.log(`${Object.keys(index).length} of ${SPOTLIGHTS.length} spotlights into ${dir}/`);
}
