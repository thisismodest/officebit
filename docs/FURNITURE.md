# Furniture

Every piece of furniture is a catalog type (`src/sim/catalog.ts`) placed at a
tile. Types describe **what they do**; art is separate.

## Affordances

| Field | Meaning |
|---|---|
| `size`, `solid` | Footprint in tiles; whether it blocks walking |
| `blocks` | `{ foot, wheels }`: in the way of people or vehicles where that isn't the usual (by default, solid things block walkers, and anything standing blocks vehicles bar bays and pitches: [MOVEMENT](MOVEMENT.md)) |
| `spots` | Tiles (relative) where users stand, sit or lie. Always walkable. |
| `offers` | Needs restored by one use, e.g. `{ energy: 0.3 }` |
| `duration` | How long a use lasts, in ticks |
| `desk` | A workstation. Only its `owner` uses it. |
| `hangout` | Crowds make it *more* appealing to social people |
| `meeting` | Where feed-driven meetings happen |
| `bed` / `petBed` | Where people / pets sleep |
| `seat` | Users are drawn sitting |
| `study` | A home desk for side projects |
| `games` | A console: sofas in the same room can be used for gaming |
| `hours` | Only open between these hours, daily (the shop's shelves) |
| `street` | Out in the street: people nip out from work to use it (food trucks) |
| `treat` | Worth going out of the way for (food trucks, pizza) |
| `play` | Swings, hopscotch: grown-ups have a go when they're feeling playful |
| `game` | An arcade machine: gamers seek it out, bored or not |
| `event` | A town event (the bonfire): worth walking over for, and the town's open to everyone while it's on |
| `standing` | A workstation worked standing up (the diner's grill) |
| `lot` | An empty plot a new company can build on |
| `staff` | Where venue staff stand to serve (the diner's till, the teacher's desk) |
| `worksite` | A building site: crews work from its spots (`siteSmall`, `siteLarge`; `siteTiny` for putting up the Christmas tree or the bonfire) |
| `groceries` | Shop shelves: using one restocks the shopper's home pantry |
| `usesPantry` | At home, meals' worth of ingredients one use takes (stove 1, fridge 0.5) |
| `weekdaysOnly` | With `hours`, closed at weekends and on bank holidays (food trucks) |
| `hardStanding` | Outdoors, goes on a forecourt or paving, not grass (chargers, bays, the canopy) |
| `gather` | Seats where friends meet up to catch up (a diner booth: [PLANS](PLANS.md)) |
| `worktop` | Seats to work on a laptop at, together (a booth, a park bench) |
| `parking` | A bay for visitors' cars: `'park'` or `'charge'` |

People pick furniture by how much it would help their most urgent need, minus
walking distance, adjusted for who's already there (see [PERSONALITIES](PERSONALITIES.md)).
Moving the coffee machine really does change the day.

## Food trucks

Street vehicles (`hours` + `street`) are traffic (`src/sim/food-trucks.ts`): on
weekdays each comes into town an hour before opening (a few minutes apart), by
whichever road it picks that day (the highway, or any road off the edge of the
map, in its left-hand lane), and leaves by another. It drives through town on the roads at the same speed as the cars, keeping
its distance and giving way at crossings, and pulls straight up off the road in
front of its pitch, onto the pavement's edge, by a route that keeps the whole truck clear
([MOVEMENT](MOVEMENT.md)). Placing one (`worlds/placement.ts`) is refused where there's no
clear way on; the map editor doesn't move trucks anyway, as the town brings them in. It serves only once it's parked, onto the
pavement, and at closing pulls back out and drives off. A truck drives by its
middle, so it keeps to the lane. The pick of roads is the same every time for a
given day, and rolls none of the story's dice.

## Parking

`parkingBay` and `chargingBay` are markings on the tarmac where visitors'
cars pull in (`parking`), with an `evCharger` post beside
each charging bay. See [TRAFFIC](TRAFFIC.md#visitors).

## Workstations

One per kind of team, all sharing a desk base: `computerDesk`, `editingDesk`
(two screens), `supportDesk` (headset), `drawingDesk` (tablet), `laptopDesk`,
`opsDesk` (parcels), `executiveDesk`. A department's `station` says which its
desks use.

## Adding a type

1. Add it to `CATALOG`.
2. Add a painter with the same id in `render/props/` (office, home, outdoor, venue or school).
   A painter draws onto a canvas the size of the footprint, plus `up` pixels
   above for tall things. Optional extras: `screen` (glows while in use), `lit`
   (night windows), `flat` (drawn under everything, like rugs), `stages`
   (building sites).
3. `validate()` the world you put it in.

## Art

Painters draw with small helpers (`rect`, `dot`, `pill`) and shared parts in
`props/common.ts` (desk bases, chairs, monitors, foliage). Each instance gets a
stable seed, so desks carry different clutter and houses different roofs.
