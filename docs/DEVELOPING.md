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

`validate(world)` catches most authoring mistakes (furniture in walls,
unreachable beds); the starter world must always validate clean.

## Deploying

Pushing to `main` publishes the site to GitHub Pages
(`.github/workflows/pages.yml`): it typechecks, runs the tests, builds
`dist/` and deploys it. Paths are all relative, so it works under
`/officebit/`. In the repo's settings, Pages' source must be **GitHub
Actions**. The workflow can also be run by hand from the Actions tab.

**Where it lives:** `homepage` in `package.json` (`https://thisismodest.com/officebit/`).
Pages (`.html`, `.xml`, `.webmanifest`) say `%SITE_URL%` and `%REPO_URL%`
wherever they need an absolute address (canonical links, `og:image`, the
sitemap, the JSON-LD), filled in as they're built (`SITE_URL` overrides the
homepage for a test build) or served (localhost). Move the site, change the
homepage.

**Search and sharing:** both pages have a description, a canonical link,
Open Graph and Twitter card tags, and `og-image.png` (1200×630, a screenshot
of the town); the landing page has JSON-LD (`WebSite`, `WebApplication`,
`SoftwareSourceCode`); `sitemap.xml` lists both. There's no `robots.txt`
here, as search engines only read one at the root of the domain: list the
sitemap in `thisismodest.com`'s own. `test/seo.test.ts` checks all this.
