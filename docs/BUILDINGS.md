# Buildings

## Levels

A **level** is one grid: the town, an office floor, or a home. You look at one
level at a time.

| `kind` | Used for | Who goes there |
|---|---|---|
| `outside` | The town | Everyone, on the way somewhere |
| `building` | Office floors | People, during work hours |
| `home` | Someone's home | Its residents, family and pets |
| `venue` | A public place (the diner) | Anyone who's awake, plus its staff |
| `school` | A school | Its pupils and teachers, on weekdays |

## Rooms, walls and doors

- A **room** is a rectangle with a floor style (`"wood"`, `"tiles"`, `"grass"`…,
  see `FLOORS` in `render/palette.ts`).
- `"walled": true` puts walls round the rectangle's edge. **Doors** are tiles
  punched through walls.
- Rooms can overlap: the smallest room containing a tile owns it. Wrap a floor
  in one big walled room, then carve rooms inside it.
- `"dept"` on a room marks it as a team's area.

## Walking

Within a level, routes are A\* over walking costs (`WALK_COST` in `grid.ts`):
pavement and zebra crossings 1, road 3, grass 4, and 1 for everything else
(forecourts, all indoor floors). Nobody walks on the `highway`. So outdoors
people keep to the paths and only cut across when it saves a lot. People
don't block each other.

## Portals

A **portal** joins a tile on one level to a tile on another: the office front
door to the pavement, stairs to stairs, a house door to the hallway inside.
Stepping onto one takes a moment (`PORTAL_TICKS`). Routes between levels are
chained through portals automatically (`navigation.ts`).

## Homes

Each person can have a home level (`"home": "home-dev"`). Where they can
choose things from depends on the time of day: the office during work hours,
home otherwise. Commuting falls out of that. `worlds/homes.ts` has an
interior for each size of house on the town map: a `terrace` (3 wide) is a
one-bed, a `house` (a semi, 4 wide) a two-bed with a desk in the second
bedroom, and a `detached` house (5 wide) a family home with a kids' room and a
study. A home can have more floors (built in the editor, `floorOf` its ground
floor: see [BUILDER](BUILDER.md#floors)), and all of them are home. Put one on the town map and a door portal to link them. Buildings open onto the row below their footprint; a house with
`"faces": "up"` opens onto the row above instead, so streets can have houses
on both sides.

## The starter town

A 160×160 square laid out by hand in districts (`worlds/town.ts`), with room
to grow and countryside all round:

- **The highway:** across the top, behind hedges, with a slip road down to
  High Street (see [TRAFFIC](TRAFFIC.md)).
- **High Street:** a row of empty lots, with Mill Lane running down past the woods.
- **Main Street:** the one road right across town, which the food trucks use.
  It has the Green with its pond, the head office, the diner, the Corner Shop,
  the charging station (`chargingStation`), more lots, and a row of terraces facing them.
- **The Avenue:** south to Acacia Road (terraces and semis) and Birch Close
  (detached family homes round a turning circle), then Acacia Primary on
  School Lane and Dover Park. Cedar Crescent is still waiting for its houses.

House plots (`PLOTS`) come in the three sizes, with spares for people moving
and newcomers. Bigger households choose first: families with children get a
detached house near the school, couples and the CEO a semi, ambitious people a
semi if one's free, everyone else a terrace. The twelve empty lots are dotted
round town.

Pavements are worked out from the roads (`layPavements` in `worlds/ground.ts`:
every tile touching a road that isn't one, except along the highway), so they
wrap round corners and the ends of dead ends, and never cross the tarmac. Zebra
crossings (`zebra`, `zebraSide` floors) continue the pavement over side roads
and sit at busy spots; walking costs rank path and crossings (1) over roads
(3) and grass (4). Trees are scattered from a fixed seed over grass only, so
the town is the same every time.

## Venues

A `venue` level is open to everyone who's awake, at work or at home. The
starter town has **The Night Owl Diner** on Main Street (`worlds/venues.ts`):
a counter with stools, booths, a jukebox and a till. Two `staff` NPCs share
it in shifts (Dot 06:00–18:00, Ray 18:00–06:00), so the neon never goes off.

**The Corner Shop**, on Main Street past the diner, is a venue *and* a workplace. It's
the `shop` company's floor, with checkouts as its desks. Shoppers restock their
home pantry at its shelves (see [NEEDS](NEEDS.md#groceries)); Wes and Juno work
there in shifts that cover its hours (07:00–15:00 and 12:00–22:00, every day),
with a spare checkout for anyone who needs a job (see [CAREERS](CAREERS.md)).

A venue with staff of its own (the shop, the diner) is only open while one of
them is in and on shift (`sim.venueOpen`); when the last goes, it shuts and
customers leave (in the News, if it's during its hours). Someone who needs the food shop while
it should be open (its hours, with staff due in) waits outside, lined up on
the pavement (the `queue` intent), and goes in when it opens. After 45
minutes they give up, fed up (less fun, and in the News), and don't try again
for three hours.

Going out is a treat. It carries a fixed effort cost (sociable and chaotic
people mind it less), happens at most once a day, and ends after about 90
minutes, when home starts calling. People only chat with others at a venue
if they're there too. Constants are at the top of `brain.ts`.

## Schools

A `school` level is only for its pupils (`"role": "child"`) and teachers
(`staff` who work there), and keeps office weeks. **Acacia Primary**
(`worlds/school.ts`), on School Lane, has a classroom with a
desk per pupil, a canteen and a playground with swings and hopscotch. Maggie
teaches 08:00–16:00. Lunch is 12:00–13:15 (`SCHOOL_LUNCH` in `brain.ts`):
pupils leave their desks and eat at the canteen tables.

## Visiting

Click any building on a map: a card shows its name, who's inside, and a
**Visit** button per floor. A building leads inside through the portal on
the row just below its footprint (above, for a house facing up); everything reachable from there without
going back outdoors counts as inside (`sim/places.ts`). This works the same
for every building: the head office, homes, new startups.

## Building in code

`worlds/layout.ts` has a small chainable builder:

```ts
new LevelBuilder('ground', 'Ground floor', 'building', 40, 26)
  .room('kitchen', 'Kitchen', [0, 0, 12, 8], 'tiles', { walled: true })
  .door([6, 7])
  .put('coffee', 2, 1)
  .desks('computerDesk', [[26, 3], [30, 3]], ['dev', 'hana'])
  .build();
```

`worlds/starter.ts` builds the whole starter town this way.
