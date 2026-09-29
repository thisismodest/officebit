// Shared by build.ts and dev.ts: turns a browser-bound .ts module into .js.
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
};

// Vendored CSS: URL prefix → directory on disk. Mirrored into dist by build.ts.
export const VENDOR = {
  '/vendor/mdst-ui/': 'node_modules/mdst-ui/dist/',
};
