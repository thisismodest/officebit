# Movement

How anything gets about: people and pets walking, babies crawling, cars and
food trucks driving. `src/sim/movement.ts`.

- **Movers.** `MOVERS` is a table of the kinds of mover: on foot or on wheels,
  their speeds in tiles per step (a walker 0.2, a crawling baby 0.06, someone
  hurrying to catch someone up 0.3, a car or a
  food truck or bus 0.45 in town, 0.9 on the highway and off the map, 0.2 creeping over
  a path or pavement), and how far their body reaches from its middle (a truck
  or a bus, three tiles long, reaches one). `speedOn(mover, floor)` is a mover's speed on a
  surface. Speeds are per step, not per game minute, so everything moves at the
  same pace on screen in every mode.
- **What's in the way.** `blocks(type, mover)`: on foot, anything solid (a desk,
  a tree, a lamppost); on wheels, anything standing on the ground except the
  places vehicles stop (parking bays, food-truck pitches). A catalog type can say
  otherwise with `blocks: { foot, wheels }`. The walking grid (`grid.ts`), the road
  map (`roads.ts`), placement and `validate()` all ask it.
- **One stepper.** `advance(mover, path, distance)` moves anything along a
  route of tiles, across then along to a tile that's off both ways, facing the
  way it's going (unless it's reversing out of a bay), and remembers where it
  was a step ago so the renderer can draw it in between.
- **Routes** come from the planners: on foot, `grid.ts` (A* within a level) and
  `navigation.ts` (doors and stairs between levels, [BUILDINGS](BUILDINGS.md));
  on wheels, `roads.ts` (keeping left, turning cleanly: [TRAFFIC](TRAFFIC.md)).
  A vehicle's route keeps its whole body clear (`reach`), and may leave the road
  only where it's allowed (`offRoad`: a food truck, the ground in front of its pitch).
  Placement refuses a food-truck pitch with no clear way on (`pitchReachable`).
- **Parked vehicles** block the tiles they stand on (a car its tile, a food truck
  its pitch): people's routes go round them, except to the one they're walking to.
  `traffic.ts` marks them on the town's grid (`grid.parked`) every step, from the space.
- **Collision** (`src/sim/collision.ts`), the other half: everything on the move
  or parked is a *body* in the sim's `space`, each level's index of bodies on foot
  and on wheels (live views of the people and vehicles, filled each step). Before
  a step, anything asks `inTheWay`, by its mover's **manners**: how close to slow
  down and to wait, how wide it is, whether to step aside for someone oncoming or
  pay them no mind, whether to give way to someone crossing (the earlier id first,
  when each is in the other's way), and how long before squeezing past anyway.
  Walkers slow behind someone, wait right behind them, step to their left to pass
  someone coming the other way (drawn a little aside: `aside`), and squeeze past
  after about a second, so nobody's ever stuck; nobody minds someone settled at
  their own spot (a desk, a seat). Vehicles keep 1.6 tiles behind the one in
  front, wait behind one stopped in their lane, and never mind other lanes; people
  on a zebra (or a path a car's crossing) have right of way, looked up in the same
  space. Parked vehicles are the space's still bodies on wheels. The space buckets
  bodies in 4×4-tile cells, so a look round reads a few buckets whatever the crowd.
  Crowds spread out:
  wander spots and places to watch the fireworks are ones nobody else has taken.
- **Catching someone up.** Someone off to chat with a person who's walking
  hurries (the `hurrying` mover) until they're within two tiles. Nobody sets off
  after someone walking more than eight tiles away, and a chase is dropped once
  they're that far ahead: they're off somewhere.
- **What moves them** stays with each kind: the sim walks people to what their
  brain chose, `traffic.ts` drives every vehicle, and the timetables say when a
  vehicle sets off (`food-trucks.ts`, `visitors.ts`, `arrivals.ts`).

New kinds of mover (trains on a `rail` surface, planes over everything) would be
entries in the table, with a planner for their surface.
