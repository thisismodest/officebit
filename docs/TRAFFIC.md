# Traffic

Cars on the town's roads: through-traffic on the highway, and visitors who
turn off it. Food trucks drive among them, on their own timetable ([FURNITURE](FURNITURE.md#food-trucks)).

## Roads

`src/sim/roads.ts`. Anything with a drivable floor is road: `road`, the zebra
crossings, `highway` and `forecourt`. Nobody walks on the `highway`.

- **We drive on the left.** Routes are Dijkstra over (tile, heading). A turn
  costs extra, and so does a tile with more road on your left (the wrong
  side). Turning round costs a lot. Forecourts and paths have no sides.
- **Paths:** a car can drive over a path or pavement when that's the only way
  (up a driveway), costing eight times a road tile to route over, at a crawl
  (0.2 tiles a step), giving way to anyone walking on it. Nothing drives
  through furniture (a lamppost, a charger, the canopy's footprint); bays are for
  cars.
- **Moving.** Cars move each step, like people walking, by the same stepper at
  their speed for the surface ([MOVEMENT](MOVEMENT.md)): 0.45 tiles a step
  in town, 0.9 on the highway. A car waits if there's one just ahead going
  the same way (or one stopped in its lane), or anyone on a zebra crossing in front of it. Cars are drawn
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

## In the starter town

The highway runs across the top of the map, with a slip road down to High
Street. The charging station (`chargingStation` in `worlds/town.ts`) is a
forecourt on Main Street, just past the shop,
under a canopy signed with a car and a lightning bolt (lit at night), with
two plain bays and two with chargers, right by the road. Cars pull in nose
first and back out. Bays are furniture (`parkingBay`,
`chargingBay`), so a world can put them anywhere a car can reach.
