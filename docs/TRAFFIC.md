# Traffic

Cars on the town's roads: through-traffic on the highway, visitors who
turn off it, people out for a drive round town, and the buses. Food trucks drive among them, on their own timetable ([FURNITURE](FURNITURE.md#food-trucks)).

## Roads

`src/sim/roads.ts`. Anything with a drivable floor is road: `road`, the zebra
crossings, `highway` and `forecourt`. Nobody walks on the `highway`.

- **We drive on the left.** Routes are Dijkstra over (tile, heading, last turn). A turn
  costs extra, and so does a tile with more road on your left (the wrong
  side), so a car pulls across into its own lane rather than stay on the wrong side. Turning round
  costs a lot, more the bigger the vehicle (two quarter-turns the same way close together count). Forecourts and paths have no sides.
- **Paths:** a car can drive over a path or pavement when that's the only way
  (up a driveway), costing eight times a road tile to route over, at a crawl
  (0.2 tiles a step), giving way to anyone walking on it. Nothing drives
  through furniture (a lamppost, a charger, the canopy's footprint); bays are for
  cars.
- **Moving.** Cars move each step, like people walking, by the same stepper at
  their speed for the surface ([MOVEMENT](MOVEMENT.md)): 0.45 tiles a step
  in town, 0.9 on the highway. A car waits if there's one just ahead going
  the same way (or one stopped in its lane), or anyone on a zebra crossing in front of it.
- **Junctions.** Two vehicles about to cross each other's way: the one nearer
  where they cross goes first and the other waits short of it. After 40
  steps waiting it goes anyway, so a ring of cars can't jam for good. Cars are drawn
  only on the map, so they drive on from its edge, and show their lights
  after dark.

## Through-traffic

`src/sim/traffic.ts`. A `highway` room is two carriageways. Its north half
runs east and its south half runs west. Cars join each lane just off the map
(about one every five seconds per lane at 1×, fewer between 22:00 and
06:00). They drive across and leave off the far edge. Traffic has its own
random stream, so it never changes the story.

## Visitors

`src/sim/visitors.ts`. Now and then (anywhere from an hour to a few days
apart, usually nearer an hour) a car leaves the highway's westbound slow
lane, drives round town and pulls into a free parking bay.

- **Stopping to eat** (half of them): the driver gets out and has a bite
  somewhere public that serves food (the diner, or a food truck at lunch).
  They take a plain bay if there is one.
- **Charging** (the other half): they take a `chargingBay`, and it takes
  25–50 minutes. Meanwhile they pop into a public place, or wait by the car.

Then they walk back, get in, and carry on west. Drivers are people with the
`visitor` role (see [PEOPLE](PEOPLE.md#kinds)). They're served at the diner
and show in the People tab and News, but they don't make friends, fall in
love, or get saved into the world. At most three visit at once.

## Out for a drive

Between 08:00 and 21:00, every 20 minutes to two hours, a car comes in by
any road off the edge of the map (the highway, or a town road, in its
left-hand lane; the same ways in and out as the food trucks, `traffic.ways`).
It drives to two to four road ends (junctions and the ends of closes, where
turning is natural; any lane will do) and leaves by another way. It doesn't stop, and it goes
round the block rather than turn round in the road where it can. At most two are out at once. They're traffic like any
other: they keep their distance and give way at crossings. They draw on
visitors' own random stream, so they don't change the story.

## Buses

`src/sim/buses.ts`. One route round town, calling at every bus stop
(`busStop`: a shelter with a bench and a poster) in turn, run both ways.

- **The route** is worked out from the stops themselves: the order that makes the
  shortest drive both ways round, in by whichever road off the map suits the first stop
  and out by another after the last. The other way round calls at the same stops backwards.
- **Each side of the road.** A bus pulls up in the lane beside the shelter, facing along the kerb
  (we drive on the left, so the shelter's on its left), or, going the other way, in the lane
  across the road, with its riders waiting on the far pavement. Each way round uses whichever side
  makes its drive shortest. Add a stop in the editor (it's named after its road), move one or delete one,
  and the route follows from the next bus; buses already out finish their round.
- **Driving:** a car's pace, three tiles long, never up on the pavement, and it
  goes round the block (or the crescent) rather than turn round in the road.
- **Timetable:** a bus each way hourly from 06:00 to 23:00 (rush hour, 07:00–10:00 and 16:00–19:00,
  can have its own gap: `EVERY.rush`; a round takes about two game hours, so four or five are out at once), and a night bus at 23:00, 01:00, 03:00 and 05:00.
  It waits half a minute where anyone's getting off or on, and pulls straight away from an empty stop.
- **Riders:** anyone who lives in town (grown-ups and children), going
  somewhere with a long walk through town (40 tiles or more). They go by bus if:
  - the stops nearest either end cut the walk by at least 40%
  - going by bus (the walks, the ride, the stops on the way) is at least 40% quicker than walking;
    the less diligent put up with a slower ride, the laziest one up to two and a half times as long as the walk
  - one's on its way that way round, or due within 15 minutes
  A fifth of people always walk, and anyone might fancy the walk (15%).
- **The journey:** they walk to the stop (the side their bus pulls up) and wait, on the bench if
  it's the shelter's side. They
  get on ("🚌 Wes got on the bus") and ride out of sight: following them follows
  the bus. They get off at the stop nearest where they're going and walk the
  rest. Waiting 30 minutes with no bus (or having just missed one at night),
  they give up and walk.

## In the starter town

The highway runs across the top of the map, with a slip road down to High
Street. Eight bus stops, placed where people go most: Main Street West and Acacia Road among the
west's homes, Main Street (the office) and Corner Shop (the shop and the diner), The Avenue,
Birch Close, Cedar Crescent and Acacia Primary. The charging station (`chargingStation` in `worlds/town.ts`) is a
forecourt on Main Street, just past the shop,
under a canopy signed with a car and a lightning bolt (lit at night), with
two plain bays and two with chargers, right by the road. Cars pull in nose
first and back out. Bays are furniture (`parkingBay`,
`chargingBay`), so a world can put them anywhere a car can reach.
