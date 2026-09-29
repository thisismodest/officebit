import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SITE_PAGES, withSite } from '../scripts/transform.ts';

const SITE = { url: 'https://example.github.io/officebit/', repo: 'https://github.com/example/officebit' };
const page = (path: string) => withSite(readFileSync(`public/${path}`, 'utf8'), SITE);
const meta = (html: string, key: string) => html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];
const pngSize = (path: string) => {
  const png = readFileSync(`public/${path}`);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

for (const path of ['index.html', 'town/index.html']) {
  test(`${path}: a title, a description, and everything a link preview needs`, () => {
    const html = page(path);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
    assert.ok(title.length > 10 && title.length <= 60, `title of ${title.length} characters`);
    const description = meta(html, 'description') ?? '';
    assert.ok(description.length >= 110 && description.length <= 160, `description of ${description.length} characters`);
    assert.match(html, /<html lang="en-GB">/);
    assert.match(html, /<link rel="canonical" href="https:\/\/example\.github\.io\/officebit\//);
    for (const key of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'theme-color']) {
      assert.ok(meta(html, key), `${key} is set`);
    }
    assert.equal(meta(html, 'og:image'), `${SITE.url}og-image.png`, 'an absolute og:image');
    assert.deepEqual([meta(html, 'og:image:width'), meta(html, 'og:image:height')], ['1200', '630']);
    assert.doesNotMatch(html, /%SITE_URL%|%REPO_URL%/);
  });
}

test('the share image and icons are the sizes they say', () => {
  assert.deepEqual(pngSize('og-image.png'), [1200, 630]);
  assert.deepEqual(pngSize('apple-touch-icon.png'), [180, 180]);
  assert.deepEqual(pngSize('icon-192.png'), [192, 192]);
  assert.deepEqual(pngSize('icon-512.png'), [512, 512]);
});

test('the landing page describes itself for search engines, in JSON-LD', () => {
  const json = page('index.html').match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
  const data = JSON.parse(json ?? '');
  const types = data['@graph'].map((node: { '@type': string }) => node['@type']);
  assert.deepEqual(types, ['WebSite', 'WebApplication', 'SoftwareSourceCode']);
  const app = data['@graph'][1];
  assert.equal(app.url, `${SITE.url}town/`);
  assert.equal(app.offers.price, '0');
  assert.equal(data['@graph'][2].codeRepository, SITE.repo);
});

// (No robots.txt: search engines only read one at the root of the domain, so the sitemap is listed in the domain's own.)
test('the sitemap lists both pages, and the manifest its icons', () => {
  const sitemap = page('sitemap.xml');
  assert.match(sitemap, /<loc>https:\/\/example\.github\.io\/officebit\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/example\.github\.io\/officebit\/town\/<\/loc>/);
  assert.ok(JSON.parse(page('site.webmanifest')).icons.length >= 3);
  assert.ok(SITE_PAGES.has('.webmanifest'));
});
