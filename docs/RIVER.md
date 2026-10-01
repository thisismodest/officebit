# The river

The River Dove runs along the bottom of town, edge to edge (`RIVER` in
`worlds/town.ts`), with a footbridge carrying Dover Park's path over to the
south bank, a beach, and the moorings: the boating club, a jetty and boats.

## Water

`water` is ground nobody walks or drives on; `shallows` can be waded (slowly);
a `bridge` (or `bridgeSide`) is walked like pavement and driven like road. Draw
water in the editor, and a road or path drawn across it is bridged
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
  bank, a path along it, a `jetty` out into the river, two sailing boats
  (`sailboat`) tied up beside it, and the club's two rowing boats (`rowboat`),
  kept inside: they're only seen while they're out.
- **A boat trip** ([PLANS](PLANS.md)): friends meet at the jetty and set off, two
  in a rowing boat, three or four in a sailing boat.
- **A row on your own**: on a fine day (April to October, by day, dry:
  `sim.boatingDay()`), the restless and the driven may walk down to the club in
  their own time and take a rowing boat out; it's the day's outing.
- **On the river**: out from the moorings, downriver or up (20 to 40 tiles), and
  back, with whoever's aboard drawn sitting in the boat (following them follows
  the boat); then ashore where they got on, and on with their day. A rowing boat
  goes back in the club. In the News: "🚣 Mo and Rowan took a rowing boat out on
  the river". Over a June fortnight, about eight trips.
