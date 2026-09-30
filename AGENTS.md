# AGENTS.md

Handoff notes for AI agents (and humans) picking up this project. Read this
first, then `ROADMAP.md` (what's next) and `docs/README.md` (how things work). Keep this file current when you change how
things work or finish something on the roadmap.

## What this is

**officebit**: an 8-bit town where a team lives, commutes and works. People
have personalities and needs; they wake, commute, work, chat, interrupt each
other, eat lunch from food trucks, go home, game, sleep. Ambitious people start
side projects that become startups with their own offices in town. Everything
is driven by a shareable JSON world, runs in the browser, and will be open
source. People can also be driven by outside data ("feeds": Slack status,
agent activity).

The owner (Marcus) is recreating his real office: two floors, stairs in the
middle. Ground floor: dining area with comfy seating, kitchen, meeting rooms,
production studio, customer service. First floor: other departments round a
kitchenette.

## How Marcus likes to work

- **Discuss before building big features.** Propose a design, recommend an
  option, ask the few questions that matter, then build. Small changes: just do them.
- **Clean, DRY, idiomatic code** that a newcomer can pick up. Small single-purpose
  modules, each with a one-line header comment naming its doc.
- **Docs: brevity is king.** One short file per aspect in `docs/`. Update the
  relevant doc when behaviour changes.
- **Vanilla stack.** Node 24 with native type stripping, `node:test`, no
  bundler, no framework. Don't add dependencies without asking.
  The only deps are `mdst-ui` and dev-only `typescript` and `@types/node`.
- **UI uses modest-ui**: Marcus's own CSS library. The npm package is
  **`mdst-ui`**; never install `modest-ui` (an unrelated Vue library). Mostly
  classless; modifiers like `mdst-button--sm`, `mdst-badge--muted`, `mdst-card`.
- **British English** in copy and docs.
- **Verify in the browser**, not just tests, before saying something works
  (see Verifying, below). Report honestly what was and wasn't checked.
- **Don't commit** unless asked (and no co-author line when you do). Pushing to
  `main` deploys to GitHub Pages (`.github/workflows/pages.yml`).

## Commands

```sh
npm run dev          # http://localhost:6060 (not 6666: browsers block 6665–6669)
npm test             # node:test against the .ts sources (~1 min)
npm run typecheck    # tsc; strict, erasableSyntaxOnly, noUnused*
npx @biomejs/biome lint .   # lint (biome.jsonc; not an npm script, not a dependency)
npm run probe -- 48  # headless: everyone's last 48 h as a timeline, plus venture events
npm run bench -- 200 # how fast: a town of 200 people, timed (docs/DEVELOPING.md#speed)
npm run spotlights          # fetch the spotlights' titles and pictures into .cache/spotlights/ (the build and dev server do it too)
npm run build        # dist/ for GitHub Pages
```

## Architecture in one screen

```
src/main.ts   entry point: wires sim, renderer, sidebar, profile and controls; runs the loop
src/sim/      Pure TS, no DOM, deterministic (seeded rng.ts, no Math.random / Date)
  world.ts        WorldDef v2: the shareable JSON format (companies, depts, levels, portals, people, npcs);
                  level kinds: outside | building | home | venue | school; NPC roles: staff | crew | child | courier | visitor
  sim.ts          Simulation: step(dt) (walking per step, everything else per game time), world editing
                  (addLevel/addItem/moveItem/edited/hire/employ…), onChange (emitter.ts)
  person.ts       Person runtime state + Intent union (+ atDesk/asleep/seatedAtDesk/faceTowards)
  intents.ts      what each intent does: where it happens, how it starts, each step, when it stops suiting
  roles.ts        kinds of people (employee, family, pet, staff, crew, child, visitor…): brain, routine, what they join in
  brain.ts        PersonalityBrain (scores options; .options() for debugging), PetBrain, StaffBrain, CrewBrain
  needs.ts        energy/hunger/social/fun: per-game-hour drain, urgency = (1-need)²
  personality.ts  traits (social, diligence, chaos, charisma, ambition) + presets
  schedule.ts     routines from traits; phases sleep/home/work; weekends; shifts
  clock.ts        1 tick = 6 game s; 600 ticks/h; day 1 = Monday 06:00
  calendar.ts     the date of any tick, sunrise and sunset where the town is; holidays.ts: fixed-date days and
                  bank holidays; festivities.ts: what the town does on them (crews put up the tree, the bonfire)
  movement.ts     how anything moves: MOVERS (walker, crawler, car, truck: speeds per surface, reach), blocks (what's
                  in whose way, from the catalog), one stepper (advance); parked vehicles block tiles (grid.parked)
  collision.ts    the other half: bodies in the sim's space (on foot, on wheels), manners, inTheWay (giving way, passing)
  grid.ts         one level's tiles + A*;  navigation.ts: routes across levels via portals
  geometry.ts     shared tile/rect/footprint maths, door rows, portal ends (sim, worlds and the editor all use it)
  catalog.ts      furniture types and affordances (offers, spots, desk, hangout, hours, parking…)
  social.ts       conversations, interruptions, rows, walk-offs; relationships.ts: per-pair compatibility + affinity
  love.ts         sparks, dating, moving in, splitting up;  housing.ts: homes, to let, moving house
  plans.ts        friends' days out: frisbee and picnics in the park, catching up, coworking on laptops
  ventures.ts     side project → launch → grow; Friday takings (hire, struggle, close; empty offices re-let); offices built by crews (construction.ts)
  careers.ts      Friday review (let go / quit / change) and weekday job hunt
  food-trucks.ts  the trucks' lunchtime runs: in on the roads as traffic, onto the pitch, and away again
  roads.ts        the road map for vehicles and routes along it; traffic.ts: highway through-traffic, cars, the ways in and out of town
  visitors.ts     cars that turn off the highway to eat or charge, and cars out for a drive round town
  buses.ts        the bus route (stops in the shortest order, timetable, night bus), and who rides instead of walking
  arrivals.ts     new family members coming home: a baby dropped off by car (it crawls in), others on foot
  interactions.ts pizza (rider), fire drills, taking control (ControlledBrain)
  works.ts        what a newer release adds to an older town, put up by crews (docs/UPGRADES.md)
  places.ts       buildings on the map and what's inside (for the click card); validate.ts: world checks
src/worlds/   starter.ts (people, 2-floor office, venues, homes), town.ts (the 160×160 town, house plots, lots),
              ground.ts (roads, paths, crossings, generated pavements), layout.ts (LevelBuilder),
              homes.ts (terrace/house/detached interiors), offices.ts (startup tier 1/2), venues.ts (diner, shop),
              school.ts, upgrades.ts (VERSION, and what each release adds to older towns), edit.ts (world edits: moving buildings, turning houses, floors, team), placement.ts (safe zones),
              rooms.ts (walled rooms and doorways)
src/render/   renderer.ts (one level through a camera; y-sorted props+people; night lighting),
              camera.ts (DOM-free), tiles.ts, characters.ts (ASCII sprites), pets.ts, cars.ts,
              palette.ts, pixels.ts, seasonal.ts (fairy lights, pumpkins, fireworks), play.ts (frisbees, laptops),
              spotlights.ts (the spotlights on billboards and posters: which, when, pixelated), props/* (one painter per catalog type)
src/ui/       overview.ts, directory.ts, news.ts, profile.ts (sidebar and slide-out; docs/UI.md), history.ts (Back),
              editor.ts (map editor), room-tools.ts (its rooms, doorways and floors), person-editor.ts (Edit on a profile), share-menu.ts + world-io.ts (save, share links, files),
              timekeeper.ts (live/sandbox), time-jump.ts (jumping ahead, another day), whereabouts.ts (your place, from your timezone), controls.ts (pan/zoom/click),
              place-card.ts, fullscreen.ts, welcome.ts (the first-visit card and ?), describe.ts + who.ts (wording), popover.ts, tabs.ts, html.ts, icons.ts (toolbar SVGs)
src/audio/    composer.ts (the music's notes, day and night, seeded), music.ts (Web Audio player), sounds.ts (effects), noise.ts;
              ui/soundscape.ts decides which effects play, ui/audio-menu.ts the switches and volumes
src/feeds/    protocol.ts (validated data-only messages), local.ts (console + postMessage)
public/       index.html + style.css (the town, at the site's root), about/ + landing.css (what officebit is), changelog/ (what's new,
              for players: add a line when something ships), sw.js (the app's service worker), og-image.png, icons,
              site.webmanifest, sitemap.xml (addresses filled in from package.json `homepage`: docs/DEVELOPING.md#deploying)
scripts/      dev.ts, build.ts, transform.ts (type-strip + .ts→.js imports, site address), probe.ts, bench.ts, spotlights.ts (fetches the spotlights with the site)
test/         node:test suites, one per area
```

Details: `docs/ARCHITECTURE.md`, and a doc per area. Walking and doors are
explained in `docs/BUILDINGS.md` (grid A\* within a level; portals and
Dijkstra over portal anchors between levels); driving in `docs/TRAFFIC.md`.

## Rules that keep it working

- **Looking must not change the story.** Any UI query that might draw random
  numbers (brain options) goes through `sim.peek()`. Traffic has its own
  random stream for the same reason.
- **Sim never touches the DOM, `Math.random`, or wall-clock time.** Same world
  + seed + feed messages ⇒ same story (tests rely on it).
- **Items are never re-indexed.** Removed furniture is flagged `gone`; iterate
  `sim.activeItems()`, not `sim.items`, in behaviour code.
- **The sim edits its own copy of the world** (new offices, hires). Always pass
  `structuredClone(STARTER)` to `new Simulation`.
- **Nothing appears or disappears out of thin air.** Buildings are built by crews,
  trucks and visitors drive in, new people walk in from the edge of town. Keep it that way.
- **World changes go through sim methods** (`addLevel`, `replaceLevel`, `addItem`,
  `removeItem`, `moveItem`, `edited`, `addPath`, `addPortal`, `addCompany`, `hire`,
  `addNpc`, `removePerson`, `employ`, `unemploy`). They rebuild grids and the
  navigator and fire `onChange`, which the renderer and panel listen to.
- **Change a person's level with `sim.setLevel`**: it keeps the index of who's
  where (`peopleOn`) up to date. A speed-up must leave `npm run probe -- 336` identical.
- **Shipping something new in the starter town?** Add it to `UPGRADES` too, or
  saved towns never get it (docs/UPGRADES.md). Bump `package.json`, `VERSION` and the changelog together.
- **Only erasable TypeScript**: no `enum`, `namespace` or parameter properties.
- **Avoid runtime import cycles**: `person.ts` holds shared runtime helpers so
  `brain.ts` and `sim.ts` don't import values from each other. `roles.ts` names
  each kind's brain as a factory the sim calls when first needed, so brains may
  read the roles table without a load-order problem.
- **Tunable numbers are named constants** at the top of their module, with units.
- **Every catalog type needs a painter** in `render/props/` with the same id.
- The starter world must `validate()` clean (tested). Run validate on any world
  you author; it catches unreachable beds, furniture in walls, and so on.
- `[hidden]` needs `display: none !important` (it's in `style.css`), because
  mdst-ui sets `display` on buttons.

## Verifying

- **Behaviour:** `npm run probe`. Tune constants, re-run, compare percentages
  and interruption counts. Watch for feedback loops (e.g. friendship making
  chats more likely at desks). Healthy baseline: work time 15–31% of a day,
  Distractors interrupt 2–3 times a day, takeaways only for chaotic types or
  magnets, at most daily.
- **Browser:** run headless Chrome with `--mute-audio --remote-debugging-port=9333`
  (muted: audio once played through Marcus's speakers) and kill it when done.
  Drive it over the DevTools protocol using Node's built-in `WebSocket`:
  `Runtime.evaluate`, `Input.dispatchMouseEvent`, `Page.captureScreenshot`.
  `officebit.follow(id)` points the camera at anyone, including crews and pets.
  `--virtual-time-budget` screenshots don't run `requestAnimationFrame`, so
  use real waits. Fast-forward from the page with
  `officebit.sim.step()` in a loop: about 5 s for 30 days.

## State (end of last session)

Working and verified in the browser:

- **Town:** 160×160 tiles in districts with countryside, empty lots, a highway
  with through-traffic, pavements and zebra crossings, a charging station.
- **People:** personalities and needs, homes with interiors, families, pets (all editable from a profile:
  looks, names, personalities, where they work, a new baby by car, leaving town),
  children at Acacia Primary, relationships, love and moving house, careers,
  ventures whose offices are built by crews, and visitors who stop to eat or charge. Friends make plans:
  frisbee and picnics on the Green, catching up at the diner, working on laptops together.
- **Places:** the two-floor office, the 24/7 Night Owl Diner and the Corner Shop,
  staffed in shifts (they close when nobody's minding them; customers queue),
  food trucks on weekday lunchtimes, arcades, billboards by the highway and a bus stop showing spotlights
  (friends' projects, pixelated from their og:image, fetched with the site, each linking out from its card).
- **Movement:** one engine for everything that moves (movement.ts) and one collision layer (collision.ts):
  people give way, step aside and never get stuck; cars and food trucks drive the roads alike, trucks by their size.
- **Time:** a real calendar: daylight follows the sun for the date where you are; UK bank holidays;
  Christmas (a crew-built tree, lights, presents, the office party), New Year, Bonfire Night, Halloween and more.
- **UI:** World/People/News sidebar (hideable) with profiles and per-person
  histories, clickable buildings and doors, follow, eased zoom, a phone layout,
  time modes (Live runs since its start date; Sandbox; jumping ahead), the map
  editor (furniture, buildings, roads, paths, crossings, rub out, rooms, doorways,
  areas without walls, floors; it saves as you go, story-built places as overrides), an About page and a welcome card, save and share
  links, interactions, feeds, opt-in music and sounds with volumes, full screen, and an installable app (PWA).

162 tests passing; typecheck and lint clean. Known gaps are under "Also on the
list" in `ROADMAP.md`.

`src/worlds/starter.ts` uses double quotes (Marcus's editor reformatted it);
everything else uses single quotes. Match whichever style the file has.

## Roadmap and open decisions

See **`ROADMAP.md`**: what's next, in order, with open questions for Marcus.
Move items to its Done section as they land.
