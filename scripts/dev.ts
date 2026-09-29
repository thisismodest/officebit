// Dev server: serves public/, and type-strips src/*.ts on request, so there is
// no watch step — edit, refresh.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { MIME, SITE_PAGES, publishedSite, toBrowserJs, VENDOR, withSite } from './transform.ts';

const PORT = Number(process.env.PORT ?? 6060);
/** Served here, but the code's where it'll be published. */
const SITE = { url: `http://localhost:${PORT}/`, repo: publishedSite().repo };

async function resolve(url: string): Promise<{ body: string | Buffer; type: string; redirect?: string }> {
  const path = normalize(decodeURIComponent(url.split(/[?#]/)[0] ?? '/'));
  if (path.includes('..')) throw new Error('bad path');
  // A folder without its slash (/town): on to /town/, as GitHub Pages does.
  if (!extname(path) && !path.endsWith('/')) return { body: '', type: 'text/plain', redirect: `${path}/${url.slice(path.length)}` };

  if (path.startsWith('/src/') && path.endsWith('.js')) {
    const source = await readFile(join('.', path.replace(/\.js$/, '.ts')), 'utf8');
    return { body: toBrowserJs(source), type: MIME['.js']! };
  }

  for (const [prefix, dir] of Object.entries(VENDOR)) {
    if (path.startsWith(prefix)) {
      return { body: await readFile(join(dir, path.slice(prefix.length))), type: MIME[extname(path)] ?? 'text/plain' };
    }
  }

  const file = join('public', path.endsWith('/') ? `${path}index.html` : path);
  const body = SITE_PAGES.has(extname(file)) ? withSite(await readFile(file, 'utf8'), SITE) : await readFile(file);
  return { body, type: MIME[extname(file)] ?? 'application/octet-stream' };
}

createServer(async (req, res) => {
  try {
    const { body, type, redirect } = await resolve(req.url ?? '/');
    if (redirect) {
      res.writeHead(301, { location: redirect });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    res.writeHead(missing ? 404 : 500, { 'content-type': 'text/plain' });
    res.end(missing ? 'Not found' : String(error));
    if (!missing) console.error(req.url, error);
  }
}).listen(PORT, () => console.log(`officebit dev server → http://localhost:${PORT}`));
