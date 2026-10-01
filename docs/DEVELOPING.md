# Developing

```sh
npm install
npm run dev          # http://localhost:6060 — edit, refresh; no watch step
npm test             # node:test, straight against the .ts sources
npm run typecheck    # tsc (dev dependencies: typescript, @types/node)
npm run probe -- 24  # simulate a day headless: everyone's timeline, ventures, recent events
npm run build        # static site in dist/, ready for GitHub Pages
npx @biomejs/biome lint .   # lint (biome.jsonc; not a dependency, so npx fetches it)
```

Needs Node 24+ (native TypeScript type stripping).

## No bundler

`scripts/transform.ts` strips types with Node's built-in `module.stripTypeScriptTypes`
and rewrites `./x.ts` imports to `./x.js`. The dev server does this per
request; `build` does it once into `dist/`. Browsers load plain ES modules.

Because types are stripped, not compiled, **only erasable TypeScript** is
allowed: no `enum`, `namespace`, or constructor parameter properties.
`tsconfig.json` enforces this (`erasableSyntaxOnly`).

## Conventions

- **One job per module**, with a one-line comment at the top saying what it is
  and which doc explains it.
- **`src/sim` never touches the DOM**, `Math.random` or the wall clock. That's
  what keeps it testable and deterministic (see [ARCHITECTURE](ARCHITECTURE.md)).
- **Tunable numbers are named constants** at the top of their module, with a
  comment and a unit (per game hour, per tick, tiles…).
- Comments explain *why*; names explain *what*.
- UI is native HTML styled by [modest-ui](https://modest-ui.com) (`mdst-ui`).
  Reach for its classes before writing CSS.

## Testing

Tests live in `test/` (`*.test.ts`) and mostly run the real sim on the starter world. Prefer
behaviour ("the workhorse out-works the distractor") over internals. When
tuning behaviour, `npm run probe` is quicker than the browser:

```
Rowan   z>WWWWWuWWWuuuuuuzzzzzzz   W25% H0% u28% c1% >14%  int 2/1
         z sleep · W work · H side project · u using · c chat · M meeting · > moving
         int: interruptions made / suffered
```

## Speed

`npm run bench -- [people] [days]` fills the starter town out to that many
people (sharing its homes and workplaces) and times a few days headless. Keep
an eye on it at 200 (about 7 s a game day on a laptop), and at the starter
town's own size (`npm run bench -- 34`: under a second a day, which is how fast
jumping ahead can go). The sim keeps a few indexes so the cost grows with
people, not people squared:
- `sim.peopleOn(level)`: who's on a level. Always change someone's level
  with `sim.setLevel`, which keeps it up to date.
- The collision space, bucketed by cell.
- Per-day answers (`dayOff`, `holiday`), per-step ones (`publicPlaces`), and
  each building's floors (`floorsOf`, cleared when the levels change).
- Worked out once and kept: the bus route's drives between stops, the food
  trucks among the furniture (both till the furniture or roads change), and the
  road search's scratch arrays.

Jumping ahead runs the sim flat out: a short jump is paced to play out over
about 8 seconds, and a long one takes 150 ms of each frame, drawing a few frames
a second.

A speed-up shouldn't change the story. Compare `npm run probe -- 336` before
and after; the output should be identical.

`validate(world)` catches most authoring mistakes (furniture in walls,
unreachable beds); the starter world must always validate clean.

## Deploying

Pushing to `main` publishes the site to GitHub Pages
(`.github/workflows/pages.yml`): it typechecks, builds `dist/` and deploys
it. It doesn't run the tests (they took eight minutes there): run `npm test` before you push. Paths are all relative, so it works at a domain's
root or under a path. In the repo's settings, Pages' source must be **GitHub
Actions**, and the custom domain is `officebit.town` (DNS at Porkbun: the four
GitHub `A` and `AAAA` records, `www` a `CNAME` to `thisismodest.github.io`, and the
Pages verification `TXT`), with HTTPS enforced. The workflow can also be run by hand from the Actions tab.

**Where it lives:** `homepage` in `package.json` (`https://officebit.town/`).
Pages (`.html`, `.xml`, `.webmanifest`) say `%SITE_URL%` and `%REPO_URL%`
wherever they need an absolute address (canonical links, `og:image`, the
sitemap, the JSON-LD), filled in as they're built (`SITE_URL` overrides the
homepage for a test build) or served (localhost). Move the site, change the
homepage.

**Spotlights:** the build fetches the spotlights' pages and pictures into `dist/spotlights/`
([FURNITURE](FURNITURE.md#spotlights)); one that can't be fetched gets the house spotlight.

**Pages:** the town is the front page (`public/index.html`), with `about/` (what
officebit is) and `changelog/` (what's new).

**What's new and versions:** `public/changelog/index.html` lists what's changed
in plain words ("Friends make plans: frisbee and picnics on the Green"), newest
first, a section per release: its version and date. Versions are semver, and
`package.json`'s `version` is the one source (a test checks the changelog's
newest matches):
- **Minor** for anything people will notice (a changelog section).
- **Patch** for fixes, which aren't listed.
- **Major** only if old saved towns or share links stop working. Below 1.0
  we're not promising yet.

Each release is tagged (`v0.4.0`) on the commit that ships it. To release:
bump the version, add the changelog section, add anything new to the starter
town to its upgrade ([UPGRADES](UPGRADES.md)), commit, tag, push.

**Search and sharing:** every page has a description, a canonical link,
Open Graph and Twitter card tags, and `og-image.png` (1200×630, a screenshot
of the town); the About page has JSON-LD (`WebSite`, `WebApplication`,
`SoftwareSourceCode`); `sitemap.xml` lists them all, and `robots.txt` points to
it. `test/seo.test.ts` checks all this.

## The app

officebit installs as an app on phones, tablets and desktops (Add to Home
Screen, or the browser's install button): `public/site.webmanifest` opens the
town standalone, without the browser's bars, and `public/sw.js`, the service
worker, makes it installable and lets it open offline. Stale files after a
release can't happen, three ways over:
- **Network first:** it fetches from the network every time, asking the server
  whether a file has changed (`cache: 'no-cache'`), rather than trusting the
  browser's own short-lived cache (GitHub Pages lets that keep files for ten
  minutes). A copy of everything is kept for when there's no signal.
- **Its cache is named after the release** (`officebit-%VERSION%`, filled in
  from `package.json` as the site's built), so each release starts a fresh cache
  and clears out the last.
- **The worker itself** is registered with `updateViaCache: 'none'`, so the
  browser always checks it afresh, and a new release's worker takes over
  straight away.

`ui/fullscreen.ts` registers it, and hides the full screen button when it's
running as the app.
