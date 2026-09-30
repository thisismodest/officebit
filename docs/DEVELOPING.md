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
an eye on it at 200 (about 6.5 s a game day on a laptop, from 8.2 before the indexes). The sim keeps a few
indexes so the cost grows with people, not people squared:
- `sim.peopleOn(level)`: who's on a level. Always change someone's level
  with `sim.setLevel`, which keeps it up to date.
- The collision space, bucketed by cell.
- Per-day answers (`dayOff`, `holiday`), per-step ones (`publicPlaces`), and
  each building's floors (`floorsOf`, cleared when the levels change).

A speed-up shouldn't change the story. Compare `npm run probe -- 336` before
and after; the output should be identical.

`validate(world)` catches most authoring mistakes (furniture in walls,
unreachable beds); the starter world must always validate clean.

## Deploying

Pushing to `main` publishes the site to GitHub Pages
(`.github/workflows/pages.yml`): it typechecks, runs the tests, builds
`dist/` and deploys it. Paths are all relative, so it works at a domain's
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

**What's new:** `public/changelog/index.html` lists what's changed, a dated
line each in plain words ("Friends make plans: frisbee and picnics on the
Green"), newest first. Add a line when something people will notice ships.

**Search and sharing:** every page has a description, a canonical link,
Open Graph and Twitter card tags, and `og-image.png` (1200×630, a screenshot
of the town); the landing page has JSON-LD (`WebSite`, `WebApplication`,
`SoftwareSourceCode`); `sitemap.xml` lists them all, and `robots.txt` points to
it. `test/seo.test.ts` checks all this.

## The app

officebit installs as an app on phones, tablets and desktops (Add to Home
Screen, or the browser's install button): `public/site.webmanifest` opens the
town standalone, without the browser's bars, and `public/sw.js`, the service
worker, makes it installable and lets it open offline. It fetches from the network
first (so a deploy shows up straight away) and keeps a copy of everything it
fetches, for next time there's no signal. Change `CACHE` in `sw.js` to clear
everyone's copies. `ui/fullscreen.ts` registers it, and hides the full screen
button when it's running as the app.
