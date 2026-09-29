# Furniture

Every piece of furniture is a catalog type (`src/sim/catalog.ts`) placed at a
tile. Types describe **what they do**; art is separate.

## Affordances

| Field | Meaning |
|---|---|
| `size`, `solid` | Footprint in tiles; whether it blocks walking |
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
| `lot` | An empty plot a new company can build on |
| `staff` | Where venue staff stand to serve (the diner's till, the teacher's desk) |
| `worksite` | A building site: crews work from its spots (`siteSmall`, `siteLarge`) |
| `groceries` | Shop shelves: using one restocks the shopper's home pantry |
| `usesPantry` | At home, meals' worth of ingredients one use takes (stove 1, fridge 0.5) |
| `weekdaysOnly` | With `hours`, closed at weekends (food trucks) |
| `hardStanding` | Outdoors, goes on a forecourt or paving, not grass (chargers, bays, the canopy) |
| `parking` | A bay for visitors' cars: `'park'` or `'charge'` |

People pick furniture by how much it would help their most urgent need, minus
walking distance, adjusted for who's already there (see [PERSONALITIES](PERSONALITIES.md)).
Moving the coffee machine really does change the day.

## Food trucks

Street vehicles (`hours` + `street`) drive in along the road below their pitch from
the east edge of town in a staggered convoy, in the westbound lane. They park
before opening and drive off west after closing (`src/sim/food-trucks.ts`). Where a truck is depends only
on the clock, so it needs no saved state.

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
