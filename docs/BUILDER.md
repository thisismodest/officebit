# Builder

Being built up a step at a time. For now: moving and adding furniture, moving
buildings, drawing roads and paths, and saving and sharing the town.

## The editor

The pencil in the tool rail (top left) opens the editor's own toolbar in its place
(`src/ui/editor.ts`). The town carries on while you edit; changes apply to it
straight away, and to the design it was built from, which saves itself in
this browser a moment after each change (and each undo). A town opened from a
link then lives here: the link comes off the address, so a reload keeps your
edits rather than opening the link again.

The toolbar only shows the tools the place has any use for: roads, paths,
crossings and turning houses round in the town; rooms, doorways and stairs
indoors.

| Tool | Does |
|---|---|
| **Move** | Drag a piece of furniture, or outside a building, somewhere else. Click it to select it. It keeps its owner, so a desk stays someone's. |
| **Add** | Pick from the thumbnails, in sections (outside: nature, street, fields, the airfield, transport; inside by kind of place), then click the map. Click again to add another. A bus stop goes beside a road (it's named after it), and the buses call there from the next one ([TRAFFIC](TRAFFIC.md#buses)). On a phone the thumbnails are a strip at the top, beside the toolbar, that shrinks to what you picked (Change opens it out again), so there's map to tap. |
| **Ground** | Outside: road, pavement, path, concrete, runway, water, shallows, beach, zebra crossing or grass, whichever you used last. Hover over it, or press and hold it, for the others beside it (its corner mark says there are more); the one you pick takes its place. Drag to draw (see below); a tap lays one dab. Concrete is hard standing, for whatever needs it: cars drive and park on it with no lanes (a forecourt like the charging station's, a car park), and it's an airfield's apron. A crossing: click a road, and it goes in two tiles wide, straight across it. |
| **Lines** (beside Ground) | Hedges, fences and flowers: drag to put up a row (or scribble a patch), a tile at a time; tiles with something in the way are left out. Whatever the catalog marks `line` is offered here, in a flyout like Ground's. A field gate (in the picker) put on a fence takes that tile's place. Grass takes them down. |
| **Grass** (under Ground) | Drag over roads, pavements, paths, concrete, water, beach, crossings and bridges to lay grass over them. A whole stroke at once. Rubbing out a road leaves its pavements. |
| **Turn round** | Turns the selected house to face the other way. |
| **Room** | Indoors: drag a box to build a walled room; click a room to rename it, change its floor or delete it; drag a selected room's wall to move it (see below). |
| **Area** | Indoors: drag a box to mark out a floor of its own with no walls, like a dining area; click one to change or delete it. |
| **Doorway** | Indoors: click a wall to open a doorway, or a doorway to close it; drag a doorway along the walls to move it (even a room's only one). |
| **Stairs up** | Indoors: click where the stairs go, and a floor is built above (see below). |
| **Delete** | Deletes what's selected (or press Delete). Buildings stay: move them instead. Deleting the stairs up to a floor you added takes that floor away (it asks first). |
| **Undo** | Undoes the last change (or Ctrl/Cmd+Z), up to 50 steps back. The steps are forgotten when you finish editing. A desk put back is its owner's again. |
| **Done** (the tick) | Closes the editor. So do the pencil, using any other part of the interface (the sidebar, the menu bar), and Esc, which first puts away what's on top: the other kinds of ground, then what's selected, then the tool (back to Move). |

Edits save themselves as you go (a moment after the last one, and straight away when you close the editor or leave the page): closing it isn't confirming anything.

Picking goes by the tile you click: a piece standing there comes before a rug
under it, and clicking the same spot again picks the next thing down, so a rug
hidden under a sofa and a TV can still be reached.

Things the town brings in itself (food trucks, pizza, building sites, a lot a crew is
about to build on) can't be picked up, and stairs aren't on offer (they'd
lead nowhere).

## Buildings

Outside, anything with a way in (houses, the office, the diner, the shop,
the school) and empty lots move like furniture, with their front door
(`moveBuilding` in `src/worlds/edit.ts`). A path is ground of its own: it stays
where it was laid, and a building never lays one (draw one with Path). Where a
building lands has to be safe (as below), and so does its door; trees and the
like there are cleared. If the front door doesn't join up with a pavement
afterwards, the editor says so: people walk across grass, but they'd rather keep
to a path. Houses can also be turned round (`flipHouse`): the door goes to the
other side. (The starter town's door paths were laid once, as it was built:
`doorPaths` in its config.)

## New buildings

Under **Buildings** in the picker (`src/worlds/buildings.ts`): houses (terrace, semi, detached) and a
narrowboat come with a home inside, to let, for newcomers and anyone moving house; a shop, a diner,
an office, a leisure centre, a garden centre, a parcel depot, a hangar, a school and a boating club come
with their inside (the starter town's templates), a door, and a company of their own under a made-up
name (Maple Stores, Hawthorn Diner…) that takes on anyone looking for work, if it has desks: the shop's
checkouts, the diner's grill, the office's eight. Each goes up straight away; small things in the way
are cleared. Select one to give it another name (on the map, inside and its company). Delete takes
it down, everything it came with, unless someone lives or works there (it says who). Undo either way.

## Roads and paths

`src/worlds/ground.ts`. Drag to draw (hold Space and drag to move the map meanwhile, as with
rooms and areas: the tools that draw on every press; it doesn't pause the town then): the stroke follows the pointer along the
grid, carrying on the way it's going until you turn. Going back the way you came
backs it up; crossing it anywhere else carries on over it, so a stroke can loop
round, close a circle, or scribble over an area to fill it (water, say). Each straight run is stored as one rectangle (roads two tiles
wide, paths one), overlapping at the corners, so a road always knows which way
it runs.

- **A road is only road.** Pavement is its own piece: draw it beside a road with
  **Pavement** (paving people walk on; it stops at a road and carries on the other side).
  Nothing lays it for you, and rubbing a road out leaves its pavements. (The starter
  town's were laid along its roads once, when it was built.)
- **Water** (two tiles wide, for rivers, canals and ponds): nobody walks in it
  (the `shallows`, for wading, are walkable but slow) and nothing drives on it.
  A **beach** (`sand`) is drawn the same way, any shape. Boats (`afloat`) go only on the water;
  outdoor things go on grass or the beach.
  It can't go over a road or path; draw the road or path across the water
  instead, and the part over the water is a **bridge** (`bridge` crossed
  north–south, `bridgeSide` east–west): walked and driven like pavement and
  road, and rubbed out with the road or path.
- **In the way:** trees, bushes, flowers, benches and lampposts are cleared
  (shown amber as you draw).
  Buildings, ponds, lots, the highway and concrete stop the stroke (red).
- **Paths and roads:** a path stops at a road and carries on the other side; a
  road replaces any path it crosses.
- **Crossing:** people can cross a road anywhere, but they prefer a zebra.
- Walkers, cars and the food trucks use new roads straight away.

Places the story built, like a startup's office, can be edited too. The
design doesn't have them, so their furniture is kept as an override
(`overrides` in the world, by level id): the story's deterministic, so it
builds that place again at the same moment, and the sim lays it out as you
left it (`sim.arranged`). A bigger office is a new layout, so it starts from
its own. People keep the desks they had.

## Rooms

`src/worlds/rooms.ts` (the tools are `src/ui/room-tools.ts`). A walled room is
a rectangle whose edge is its wall, as the buildings are made; rooms side by
side overlap by a tile, so they share one wall.

- **Building a room:** drag a box. Its edges snap onto walls within a tile, so
  it shares them rather than standing a wall next to a wall (unless snapping
  would put it somewhere it can't go). It must fit inside the building's
  outside walls, sit inside or beside other rooms but never across them, have
  at least a tile of floor inside, and not have a wall go through furniture or
  across the stairs. It gets a doorway, in the wall nearest the way in.
- **Areas** (the Area tool) are rooms without walls: a floor of its own,
  like the dining area. Drag a box; it may go round furniture, but not across
  a room or another area. It starts on a floor that shows up against the one
  it's on.
- **Changing one:** click it. The card, under the status line, renames it or
  changes its floor. Drag one of its walls (an area's edges) to move it;
  doorways still in the wall stay. The toolbar's delete (or the Delete key)
  takes it away: a room's walls and their doorways go, an area's floor goes,
  and what's in it stays.
- **Doorways** go along a wall, not at a corner, with floor either side. The
  front door and the stairs stay as they are, the outside walls get none, and
  every room keeps at least one. Dragging one moves it: the new one opens and
  the old one closes as one change (`moveDoor`), so a room's only doorway can move.
- **Nothing gets cut off:** no change may leave a door, the stairs, or
  somewhere people use furniture from out of reach of the way in.

## Floors

**Stairs up** builds a floor above wherever you click (where a 2×2 staircase
fits): the same size, one room inside the same outside walls, and stairs back
down in the same spot (`planFloor` in `src/worlds/edit.ts`). It's named in
order (First floor, Second floor…), and it's part of the same building
(`floorOf`, the ground floor's level id): every floor of a house is home, so
a bed upstairs is where they'll sleep and a kitchen upstairs cooks from the
same cupboard; a new office floor joins its company. Each floor has one floor above it at most (more stairs on
the ground floor won't stack another; go up to build higher), and a house goes
up to three floors, anywhere else five. Only floors you added
come away, from the top down, by deleting their stairs. Floors go in places
that are part of the design (not a startup's office the story built).

## Safe zones

Furniture only goes where it's safe (`src/worlds/placement.ts`). The outline
under the pointer is white where it can go and red where it can't, and the
status line says why:

- wholly inside one room, so never half on a wall or across two rooms;
- off walls, doors and stairs, and clear of the tiles either side of them
  (except floor coverings: a rug can run right up to and across a doorway);
- clear of other furniture, except floor coverings (rugs, flowers: nothing
  solid, nothing to use it from), which things can stand on and which can slide
  under things;
- with the spots where people stand or sit to use it free (not on a wall, a
  doorway, or another piece people use);
- outdoors, on grass (or, for the charging station's things, hard ground:
  its canopy, chargers and bays go on concrete or paving);
- and never cutting anything off: every door, stair and spot that could be
  reached from the way in before can still be reached after.

## Save and share

The cog in the tool rail, your town's settings (`src/ui/share-menu.ts`):

| | |
|---|---|
| **Your town's name** | Shown in the menu bar (instead of "Town"), the World tab and the browser tab, so it's plainly yours when you come back. Saved with the town (and in links and files); blank, it's just Town again. |
| **Save in this browser** | `localStorage` (`officebit:world`); it opens next time. Edits save themselves; this is for a town you've opened from a file or link and not changed. |
| **Copy a link** | The whole world, deflated and base64url'd into `#w=…` (about 14k characters for the starter town). Opening the link opens the town. |
| **Export / Import townfile** | The town as a JSON file (see [WORLD](WORLD.md)) |
| **Start again** | Back to the starter town, forgetting the save |

On load, a link wins over a save, and a save over the starter town. Whatever
comes in is checked (`checkWorld` in `src/ui/world-io.ts`: the shape, then
`validate()`); if it won't do, the starter town opens instead and the News
says why.

## Coming next

Team editing (adding people, departments, paste-a-list) is written and tested
in `src/worlds/edit.ts`, waiting for its dialog. Lots from the picker, and naming roads.
