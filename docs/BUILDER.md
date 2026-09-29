# Builder

Being built up a step at a time. For now: moving and adding furniture, moving
buildings, drawing roads and paths, and saving and sharing the town.

## The editor

The pencil in the tool rail (top left) opens the editor's own toolbar in its place
(`src/ui/editor.ts`). The town carries on while you edit; changes apply to it
straight away, and to the design it was built from, so saving keeps them.

| Tool | Does |
|---|---|
| **Move** | Drag a piece of furniture, or outside a building, somewhere else. Click it to select it. It keeps its owner, so a desk stays someone's. |
| **Add** | Pick from the thumbnails (indoor things indoors, outdoor things outside), then click the map. Click again to add another. |
| **Road**, **Path** | Outside: drag to draw one (see below). A tap lays one dab. |
| **Crossing** | Click a road to put in a zebra crossing, two tiles wide, straight across it. |
| **Rub out** | Drag over roads, paths, pavements and crossings to turn them back to grass. Pavement never runs across the end of a road, so a gap you rub out goes to grass (a one-tile gap keeps the pavements either side joined). Rubbed-out pavement leaves a patch of verge that pavement isn't laid over again (until you draw a path or road there). |
| **Turn round** | Turns the selected house to face the other way. |
| **Delete** | Deletes what's selected (or press Delete). Buildings stay: move them instead. |
| **Undo** | Undoes the last change (or Ctrl/Cmd+Z), up to 50 steps back. The steps are forgotten when you finish editing. A desk put back is its owner's again. |
| **Done** | Closes the editor (so does the pencil, or using any other part of the interface, like the sidebar or the menu bar). |

Picking goes by the tile you click: a piece standing there comes before a rug
under it, and clicking the same spot again picks the next thing down, so a rug
hidden under a sofa and a TV can still be reached.

Things the town brings in itself (food trucks, pizza, building sites, a lot a crew is
about to build on) can't be picked up, and stairs aren't on offer (they'd
lead nowhere).

## Buildings

Outside, anything with a way in (houses, the office, the diner, the shop,
the school) and empty lots move like furniture, with their front door and
front path (`moveBuilding` in `src/worlds/edit.ts`). Where they land has to be
safe (as below), and so do their door and path; trees and the like there are
cleared. If the front door doesn't join up with a pavement afterwards, the
editor says so: people walk across grass, but they'd rather keep to a path.
Houses can also be turned round (`flipHouse`): the door and path go to the
other side.

## Roads and paths

`src/worlds/ground.ts`. Drag to draw: the stroke follows the pointer along the
grid, carrying on the way it's going until you turn, and backing up if you go
back over it. Each straight run is stored as one rectangle (roads two tiles
wide, paths one), overlapping at the corners, so a road always knows which way
it runs.

- **Pavements** are laid again after every change, round every road (the
  town uses the same code), so corners, junctions and dead ends take care of
  themselves.
- **In the way:** trees, bushes, flowers, benches and lampposts are cleared
  (shown amber as you draw), and so are any on the new road's pavements.
  Buildings, ponds, lots, the highway and the forecourt stop the stroke (red).
- **Paths and roads:** a path stops at a road and carries on the other side; a
  road replaces any path it crosses.
- **Crossing:** people can cross a road anywhere, but they prefer a zebra.
- Walkers, cars and the food trucks use new roads straight away.

Places the story built, like a startup's office, can be edited too, but only in
the running town: the design doesn't have them, so those changes aren't saved
with it (the editor says so).

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
  its canopy, chargers and bays go on a forecourt or paving);
- and never cutting anything off: every door, stair and spot that could be
  reached from the way in before can still be reached after.

## Save and share

The share icon in the tool rail (`src/ui/share-menu.ts`):

| | |
|---|---|
| **Save in this browser** | `localStorage` (`officebit:world`); it opens next time |
| **Copy a link** | The whole world, deflated and base64url'd into `#w=…` (about 14k characters for the starter town). Opening the link opens the town. |
| **Download / Open a file** | The world as JSON (see [WORLD](WORLD.md)) |
| **Start again** | Back to the starter town, forgetting the save |

On load, a link wins over a save, and a save over the starter town. Whatever
comes in is checked (`checkWorld` in `src/ui/world-io.ts`: the shape, then
`validate()`); if it won't do, the starter town opens instead and the News
says why.

## Coming next

Team editing (adding people, departments, paste-a-list) is written and tested
in `src/worlds/edit.ts`, waiting for its dialog. Rooms, doors and floors come
back once they have rules that stop walls stacking up. New houses and lots from
the picker, and naming roads.
