// Static build for GitHub Pages (or any static host): no bundler, just
// type-stripped ES modules plus the public/ folder and vendored CSS.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { toBrowserJs, VENDOR } from './transform.ts';

const OUT = 'dist';

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

await rm(OUT, { recursive: true, force: true });
await cp('public', OUT, { recursive: true });

let modules = 0;
for await (const file of walk('src')) {
  if (!file.endsWith('.ts')) continue;
  const out = join(OUT, file.replace(/\.ts$/, '.js'));
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, toBrowserJs(await readFile(file, 'utf8')));
  modules++;
}

for (const [url, dir] of Object.entries(VENDOR)) {
  await cp(dir, join(OUT, url), { recursive: true });
}

// Stop GitHub Pages running the output through Jekyll.
await writeFile(join(OUT, '.nojekyll'), '');

console.log(`Built ${modules} modules into ${OUT}/`);
