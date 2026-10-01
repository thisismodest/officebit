# The river

The River Dove runs along the bottom of town, edge to edge (`RIVER` in
`worlds/town.ts`), with a footbridge carrying Dover Park's path over to the
south bank, a beach, the moorings (the boating club, a jetty and boats), and
Fen's narrowboat.

## Water

`water` is ground nobody walks or drives on; `shallows` can be waded (slowly);
a `bridge` (or `bridgeSide`) is walked like pavement and driven like road. Draw
water, shallows and beaches in the editor, and a road or path drawn across water is bridged
([BUILDER](BUILDER.md#roads-and-paths)). Pavements are never laid on water.

## Swimming

A sandy beach on the north bank, just east of the footbridge, with shallows in
front of it and a lifebuoy (`lifebuoy`, a `summer` thing to use: its spots are
in the shallows). On a summer's day (June to August, by day, and dry:
`sim.summerDay()`) anyone who goes out may walk down for a swim in their own
time: it's the day's outing, worth the walk, more so for the sociable and the
playful. In the water, people are drawn head and shoulders, face on, with
ripples. Over a July fortnight, about a dozen swims, two in at once at most.

## Boats

`sim/boats.ts`. The river is somewhere to route too: the road planner over
`WATERWAYS` (open water, under bridges, the shallows at a pinch; no lanes), at a
boat's gentle pace (`MOVERS.boat`).

- **The moorings**, west of the footbridge: the boating club (`boathouse`) on the
  bank, a building like any other (its door onto the bank path, into the
  clubhouse, a venue: boat racks, a corner for a cup of tea; `buildClubhouse`
  in `worlds/venues.ts`), a path along it, a `jetty` out into the river, two sailing boats
  (`sailboat`, in the editor's picker: they go on the water) tied up beside it, and
  the club's two rowing boats, kept inside (on the racks): one comes out of the
  club's doors onto the water while someone's rowing it (`rowboat`), and goes back in after.
- **A boat trip** ([PLANS](PLANS.md)): friends meet at the jetty and set off, two
  in a rowing boat, three or four in a sailing boat. Once a day on the river is enough for anyone.
- **A row on your own**: on a fine day (April to October, by day, dry:
  `sim.boatingDay()`), the restless and the driven may walk down to the club in
  their own time, take a boat off the rack (`boatRack`) and row out from the
  club's doors; it's the day's outing. Back again, they step off in the
  clubhouse and walk out.
- **On the river**: out from the moorings, downriver or up (20 to 40 tiles), and
  back, with whoever's aboard drawn sitting in the boat (following them follows
  the boat); then ashore where they got on, and on with their day. A rowing boat
  goes back in the club. In the News: "🚣 Mo and Rowan took a rowing boat out on
  the river". Over a June fortnight, about two dozen trips, Fen's most days.

## The narrowboat

Fen lives on a narrowboat moored along the north bank, west of the club
(`NARROWBOAT` in `worlds/town.ts`): a `narrowboat` on the water with its door
onto the bank path, like a house's, into one long cabin (`buildNarrowboat` in
`worlds/homes.ts`: bed, galley, sofa). Fen is a `resident` (on no one's books;
see [PEOPLE](PEOPLE.md#kinds)), restless and driven, so out rowing on most fine
days; the portholes glow of an evening when Fen's in. So there's always a boat
on the river.
