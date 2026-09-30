# Roadmap

What's planned, roughly in order. Keep it current: move things to **Done**
when they land, note decisions as they're made. Details of anything shipped
live in `docs/`.

## Now

### 1. NPCs as real characters
Done: family members have presets; the diner (Dot on days, Ray on nights) and
the Corner Shop (Wes and Juno) are staffed in shifts by people with homes and a
life off shift. Venues close when nobody's minding them, and customers queue
outside until they open. Still to do:
- Shop staff stocking shelves between customers.

### 2. People UI: follow-ups
Done: the profile slide-out (for NPCs too, with what's happened to them
lately), the directory of everyone, the World overview, the News tab with its
per-person filter (see `docs/UI.md`), toolbar icons, the phone layout and a
sidebar you can fold away. Still to do:
- A simpler UI overall: fewer boxes, more icons.
- A mini-map in the overview.

## Next

### 3. Time modes ✓
Done (see `docs/TIME.md#modes`): Live (the default, running since the day it
started), Sandbox, and jumping ahead from the clock. Still to do: scenario triggers.

### 4. Relationships ✓
Done (see `docs/RELATIONSHIPS.md`): compatibility and affinity per pair,
friends seeking each other out, dislike, walking off and having words.

### 5. Love ✓
Done (see `docs/LOVE.md`): sparks, asking out, date nights at the diner,
moving in together (upsizing from two terraces), homes to let for newcomers,
quiet break-ups. Decided: break-ups yes, but rare and quiet; starting
households never split. Lines: adults only, nobody already spoken for, and
`"love": false` / `"romance": false` to opt out.

### 6. Builder
Rebuilding it a step at a time (see `docs/BUILDER.md`). Done: a floating map
editor to move, add and delete furniture in safe spots; moving buildings (with
their doors and paths) and turning houses round; building rooms, doorways and
floors (stairs up, and every floor of a house is home), areas without walls, moving doorways;
editing people from their profile (look, name, department, personality, household,
let go, leave town); drawing roads, paths and zebra
crossings, and rubbing them out; save and share (browser, link, file), validated
on load. Next, in order:
- Adding someone new to the team (the profile edits people who are here already).
- New houses and lots from the picker; naming roads; companies.
- Furniture can be placed on empty lots; it shouldn't be.
- Share the town as it is now (a 1:1 link: its people, time and story), not
  just its design. *Open:* Marcus to choose how.

### 7. Interactions ✓
Done (see `docs/INTERACTIONS.md`): pizza (delivered by a rider) and fire
drills from the World tab, and taking control of someone. Nudges were tried
and dropped.

## Later

### 8. A "god": an LLM playing a person
An LLM controls one person (a `Brain` implementation), but with wider
powers. It can talk to people, persuade them (to quit, join a venture, move,
date), and change the course of their lives.
- **Perception:** a compact text summary of the person's situation, who's
  nearby, their relationships and recent events.
- **Actions:** tool calls mapping onto intents, plus special moves such as
  speech, persuasion and world events. Each is validated by the sim, so the
  LLM can't break the rules.
- It decides every few in-game minutes; the personality brain fills the gaps.
- Keys: bring your own API key on static hosting, or a small backend later.
  Never store keys in shared worlds.
- *Open:* how far its powers reach, and how to keep a replayable record
  (log the LLM's decisions as if they were feed messages).

### Movement, one engine for everything
Done (see `docs/MOVEMENT.md`): one table of movers and their speeds, one stepper for
people, pets, babies, cars and trucks; what blocks what, from the catalog, for walkers and
vehicles alike; routes that know a vehicle's size (a truck keeps its body clear, and pulls
onto its pitch by a real route; placement refuses a pitch with no clear way on); parked
vehicles block the tiles they stand on; one collision layer (collision.ts) for everything: people
give way, step aside to pass and never get stuck, cars keep their distance, crowds spread out.
Next, when wanted: trains (a rail surface), planes.

### Plans ✓
Done (see `docs/PLANS.md`): friends and friendly colleagues play frisbee and
have picnics on the Green (family along), catch up at the diner; co-founders and the ambitious
work on laptops together at a booth or on a bench.

### Ventures: good weeks and bad ✓
Done (see `docs/VENTURES.md#good-weeks-and-bad`): launched ventures take money in or lose it each
Friday; doing well, they hire into free desks; struggling, the less committed leave; out of money,
they close, their people look for work (old jobs back, the shop, anywhere) and the office is let to
the next venture. Next, when wanted: ventures that outgrow eight desks (a floor added by a crew).

### Spotlights ✓
Done (see `docs/FURNITURE.md#spotlights`): billboards along the highway and a bus-stop poster, taking
turns hourly with projects pixelated from their og:image (fetched with the site, so offline too; the
house spotlight when one can't be); click one for its card and link. Named "spotlights" so ad blockers
leave the town alone.

### Buses ✓
Done (see `docs/TRAFFIC.md#buses`): six stops round one route (worked out from the stops), every
quarter of an hour at rush hour, hourly by day and a night bus every two hours; anyone with a long
walk may ride, some always walk, and nobody waits for ever. Next, when wanted: more routes.

### Town upgrades ✓
Done (see `docs/UPGRADES.md`): versions, and what a release adds to the starter town reaching
towns made before it, put up by crews.

### Also on the list
- Co-founders and couples visiting each other's homes.
- Feed transports (WebSocket, SSE, polled JSON) and bridges (Slack, agents).
- Residents' cars: people who live far from work drive in, parking on the street
  or at the charging station (the roads, routing and parking are there: see `docs/TRAFFIC.md`).
- Town events (a fair on the Green, a market): the town gets busy all at once, with
  visitors driving in for it.
- Music that follows who you're watching (see `docs/AUDIO.md`; the ambient music is done).
- More of the calendar (see `docs/TIME.md#holidays`; seasons, Christmas, New Year, Bonfire Night and
  the fixed-date days are done): birthdays (set in the profile), Easter and the moveable bank holidays,
  weather (rain keeps people in, snow days), the town's look changing with the seasons (blossom, autumn trees).

## Done

Two-floor office, 160×160 town in districts (houses face both ways) with
countryside round it, homes with interiors, family members and pets, day/night,
weekends, commuting, food trucks that drive in, games and arcades, ventures
(idea → pitch → launch → grow), construction crews, the 24/7 diner, the Corner
Shop and home pantries, careers (let go, quit, job hunt, hiring), clickable
buildings, following across levels, eased zoom, feeds, docs, walking that keeps
to pavements and paths, NPC presets, diner and shop staff on shifts, venues that
close and queues outside them, the World/People/News sidebar (foldable) and
profiles for everyone, per-person event histories, children and the primary
school, the highway with through-traffic, visitors who stop to eat or charge
their car, the charging station, relationships, love, time modes, interactions,
the map editor (furniture, buildings, roads, paths, crossings, rub out), save
and share links, music and sounds with volume sliders, a favicon, and a clean lint.
