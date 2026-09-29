// Dev server: serves public/, and type-strips src/*.ts on request, so there is
// no watch step — edit, refresh.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { MIME, toBrowserJs, VENDOR } from './transform.ts';

const PORT = Number(process.env.PORT ?? 6060);

async function resolve(url: string): Promise<{ body: string | Buffer; type: string }> {
  const path = normalize(decodeURIComponent(url.split(/[?#]/)[0] ?? '/'));
  if (path.includes('..')) throw new Error('bad path');

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
  return { body: await readFile(file), type: MIME[extname(file)] ?? 'application/octet-stream' };
}

createServer(async (req, res) => {
  try {
    const { body, type } = await resolve(req.url ?? '/');
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    res.writeHead(missing ? 404 : 500, { 'content-type': 'text/plain' });
    res.end(missing ? 'Not found' : String(error));
    if (!missing) console.error(req.url, error);
  }
}).listen(PORT, () => console.log(`officebit dev server → http://localhost:${PORT}`));
