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
their doors and paths) and turning houses round; drawing roads, paths and zebra
crossings, and rubbing them out; save and share (browser, link, file), validated
on load. Next, in order:
- A team dialog (people, departments, paste-a-list; the editing is already in
  `worlds/edit.ts`).
- Rooms, doors and floors, with rules so walls never stack or overlap.
- New houses and lots from the picker; naming roads; family, pets and companies.
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

### Also on the list
- Co-founders and couples visiting each other's homes.
- Feed transports (WebSocket, SSE, polled JSON) and bridges (Slack, agents).
- People walking through each other (they don't block each other).
- The arcade machines are rarely used.
- Residents' cars: people who live far from work drive in, parking on the street
  or at the charging station (the roads, routing and parking are there: see `docs/TRAFFIC.md`).
- Town events (a fair on the Green, a market): the town gets busy all at once, with
  visitors driving in for it.
- Parked cars don't block people walking past them yet.
- Music that follows who you're watching (see `docs/AUDIO.md`; the ambient music is done).

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
