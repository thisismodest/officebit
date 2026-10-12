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
- New houses and lots from the picker; naming roads; companies.
- Furniture can be placed on empty lots; it shouldn't be.
- Share the town as it is now (a 1:1 link: its people, time and story), not
  just its design. *Open:* Marcus to choose how.

### 7. Interactions ✓
Done (see `docs/INTERACTIONS.md`): pizza (delivered by a rider) and fire
drills from the World tab, and taking control of someone. Nudges were tried
and dropped.

## Play and learn

Games and things to learn from, for players of every age (teenagers on school iPads, and the 4–10s). Lines that hold
for all of it: nothing to sign up to, no chat or play with strangers (anything social goes by a share link between
people who know each other), no ads, nothing collected about anyone; short sessions; and nothing that changes the
town's story unless it's meant to (a game reads the town; a bot or a startup is part of it, on purpose).

### Games ✓ (so far)
Done (see `docs/GAMES.md`): the arcade (Caterpillar, Brick Bash, Space Rocks, Bubble Blaster, Cross the Road); out in
town, Parcel Dash, Find it, Catch!, fishing (by any water) and penalties. Next, in roughly this order:
- **Beat my time:** finishing a game gives a link with the score and the town; a friend plays the same course, and
  sees whose is best. Leaderboards between friends, without accounts.
- **Two players on one device:** a pong-style Paddle Battle and a top-down duel in the arcade; split-screen Parcel
  Dash.
- **Time trials:** go-karts round the town's own roads, against a ghost of your best lap.
- **A proper kickabout:** one against one across the pitch, against a townsperson (ball physics, an opponent that
  runs); penalties are its start.
- **A treasure hunt:** clues across town (Find it's big sibling).
- More arcade classics under our own names: a falling-blocks puzzler, a maze chase.

### 9. Data detective
The town as data, and fair tests on it (statistics and the scientific method).
- **A Data tab:** charts of the last week, drawn on a canvas (no dependencies): moods and needs, commute times, who
  interrupts whom, a web of who's friends with whom, each venture's money. Each as a table too, to export to a
  spreadsheet.
- **Experiments:** make a prediction ("moving the coffee machine next to Design cuts their focus"), make the change,
  and the town runs a week twice out of sight (a few seconds each), as it was and with the change, from the same
  start. Because the sim is deterministic, the only difference is yours: a controlled experiment, side by side.
- *Open:* which charts first; whether experiments run from now or from a saved moment; how a prediction's put (a
  slider, a choice).

### 10. Bot workshop
Coding: write a program that lives in the town.
- **Where:** a computer in the office or the school opens the workshop, a screen of its own (like the arcade): your
  code on one side, the town on the other.
- **Who:** a robot that walks in from the edge of town (nobody's life taken over). It's told what to do in plain
  commands, `walkTo('the diner')`, `use('coffee machine')`, `chatWith('Nia')`, `wait(10)`, `say('hi')`, and can ask
  the time, who's near, what's open and where things are. Code answers events: `onArrive`, `every(hour)`, `whenIdle`.
- **Safe:** the code runs walled off (a worker, no page, no saves, no network), with a time limit, and talks to the
  town only through those commands. They reach the sim as data, like taking control's orders, so the town still saves
  and the story's still the sim's own, given what went in.
- **Puzzles to learn with,** each checking itself: get to the diner before it shuts; make three friends today; deliver
  three parcels; keep your needs above half all day. Starter code and hints; solving one opens the next.
- **In two goes:** JavaScript with a friendly API first (for teenagers); then blocks to drag and drop (for younger
  players), a small block editor of our own.
- **Share a bot** by link: it runs in your friend's town.
- *Open:* bots in Live as well as Sandbox, or in a practice copy of your town; what the robot looks like and where it
  lives; how many at once.

### 11. Run a startup
Economics, by taking the helm of a venture.
- **Take over** one that's going (or start one: pick a founder and an idea), and run it: its price, who to hire and
  when, spending on getting the word out, and when to move to a bigger office.
- **Fridays:** takings come in, with money in, money out, profit, and how many weeks the cash will last.
- **What the sim needs:** a venture with a product (an app, a bakery, a games studio) and levers that work through
  the town: cheaper brings more customers, more staff makes more but costs more in wages; good weeks and bad as now.
- Your decisions are the town's story (in Live, its history).
- *Open:* real products for ventures (more work, but it makes the decisions mean something); how much is left to
  chance; whether rivals open up.

### Schools
- *Open:* whether officebit sets out to be at home in a classroom: a page for teachers with lesson ideas (the data
  detective, the bot workshop, the town planner), perhaps a quiet mode with the games behind a switch. Or it stays a
  thing for fun that happens to teach.
- **Town planner challenges** (civics and geography): "the 8:30 bus is packed: fix it", "cut the queue at the food
  trucks", "get everyone home by six": you change roads, crossings and stops in the editor, and the sim scores it.
- **Did you know?** cards on the World tab for what the sim already knows: why days are shorter in winter (sunrise
  follows where you are), how personality shapes a day, the river and the weather.

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
Planes are done (see `docs/TRAFFIC.md#planes`). Next, when wanted: trains (a rail surface).

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
towns made before it, put up by crews; towns from before 0.5 move onto the new map.

### The new town ✓
Done (0.5; see `docs/BUILDINGS.md#the-starter-town`, `docs/WORLD.md#town-configs`): the starter town is
data (`starter.config.ts`); the map from mock-up D; the leisure centre; hedges and fences; people's own
cars and car parks; two airfields with a plane between them, used like the bus.

### Also on the list
- Beyond the edge of town: other towns and scenes that exist once someone leaves the map (the highway and the river lead somewhere). With accounts, visiting other people's live towns: their people, their day, as it is right now.
- Bowling at the leisure centre (or a venue of its own), for wet days.
- People's own cars, next: couples sharing one, new households buying one, parking on the street.
- An og:image of the new town (the share picture still shows the old map).
- Hedges and fences drawn in a stroke in the editor, like paths (they go in a tile at a time for now).
- Bus lines: each stop on a line (a name saved with it, chosen in the editor; no line is the main one), a route worked out per line, so rides are shorter and more direct (one loop round all eight stops takes over two hours). Riders take the one line that suits; changing buses later.
- Single-width roads (one lane, for both ways): cars meeting head-on wait at the end, or in a passing place, for the other to clear. Then they're another choice under Ground.
- Bus stops: something to mark where the bus the other way pulls up, across the road from a shelter (a flag on a pole was tried; placing it clear of paths and the road needs care).
- Editor: anything you can move, you can add and delete too (now a rule in AGENTS.md). Still to do: buildings with interiors from the picker (houses, the boating club, a narrowboat, venues and lots).
- Vehicle interiors: an inside for each vehicle that carries people (the plane's cockpit and seats, the bus, cars, the food trucks' kitchens, the van and the lorry), like the narrowboat but not a home and editable. Getting on puts someone in a seat inside, following them takes you in, and clicking a vehicle offers "Look inside". For now, following someone aboard follows the vehicle.
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
