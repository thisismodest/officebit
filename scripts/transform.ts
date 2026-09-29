// Shared by build.ts and dev.ts: turns a browser-bound .ts module into .js,
// and fills in where the site lives.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Relative specifiers only (`./x.ts`, `../x.ts`) — bare imports are left alone.
const TS_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\.ts\2/g;

export function toBrowserJs(source: string): string {
  const js = stripTypeScriptTypes(source, { mode: 'strip' });
  return js.replace(TS_SPECIFIER, '$1$2$3.js$2');
}

export const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** Where the site lives, for the absolute links that sharing and search need (og:image, canonical, the sitemap). */
export interface Site {
  /** With a trailing slash: `https://owner.github.io/officebit/`. */
  url: string;
  /** The code: `https://github.com/owner/officebit`. */
  repo: string;
}

/** Pages that mention the site's address (`%SITE_URL%`, `%REPO_URL%`), filled in as they're served or built. */
export const SITE_PAGES = new Set(['.html', '.txt', '.xml', '.webmanifest']);

/**
 * Where it'll be published: `homepage` in package.json (SITE_URL overrides it,
 * say for a test build). The code's address comes from REPO_URL (the Pages
 * workflow sets it), or the git remote.
 */
export function publishedSite(): Site {
  let remote = '';
  try {
    remote = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // Not a git checkout: no repo address to give.
  }
  const [, owner, repo] = remote.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?$/) ?? [];
  const { homepage } = JSON.parse(readFileSync('package.json', 'utf8')) as { homepage?: string };
  const url = process.env.SITE_URL ?? homepage ?? 'http://localhost:6060/';
  return {
    url: url.endsWith('/') ? url : `${url}/`,
    repo: process.env.REPO_URL ?? (owner && repo ? `https://github.com/${owner}/${repo}` : 'https://github.com/'),
  };
}

export function withSite(text: string, site: Site): string {
  return text.replaceAll('%SITE_URL%', site.url).replaceAll('%REPO_URL%', site.repo);
}

// Vendored CSS: URL prefix → directory on disk. Mirrored into dist by build.ts.
export const VENDOR = {
  '/vendor/mdst-ui/': 'node_modules/mdst-ui/dist/',
};
