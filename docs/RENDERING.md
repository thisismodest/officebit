# Rendering

Canvas 2D, 16 px tiles, stepped zoom ([Camera](#camera)) with smoothing off. Everything is drawn
in code; the only image file is the favicon (`public/favicon.svg`).

| Module | Draws |
|---|---|
| `tiles.ts` | A level's static layer: floors, 3/4-view walls, shadows, doorways |
| `props/` | Furniture sprites (see [FURNITURE](FURNITURE.md)) |
| `characters.ts` | People: ASCII templates, palette-swapped, cached |
| `pets.ts` | Cats and dogs, side-on |
| `vehicles.ts` | Every vehicle from its look in `VEHICLES` (cars, food trucks on the move, the bus), and their lights |
| `palette.ts`, `pixels.ts` | Shared colours and drawing helpers |
| `renderer.ts` | Composes a frame for the current level |
| `camera.ts` | Pan, zoom, follow (DOM-free, unit tested) |

## A frame

1. Draw the cached static layer.
2. Y-sort furniture, people and cars by their feet, so people walk behind desks and
   in front of sofas. `sortOffset` and `flat` tweak furniture order. Vehicles
   are clipped to the map, so they drive on from its edge rather than out of the dark.
   Screens in use (monitors, TVs, arcade machines) glow as they're drawn.
3. Night: fill a darkness layer, cut out light around lamps, lampposts, the
   charging canopy, lit windows, screens and headlights, and draw it over the
   top; then moving cars' head and tail lights on top of the dark. How dark
   follows the real sun for the date ([TIME](TIME.md#the-calendar)).
   The Christmas tree and the bonfire (while it's burning) are lights too.
   **Seasons** (`seasonal.ts`, town map only): fairy lights along the houses' eaves
   after dark in December, pumpkins on doorsteps in the week of Halloween, and
   fireworks over the Green on Bonfire Night and at New Year (worked out from the
   clock alone, so the soundscape hears the same bursts it shows).
4. Speech bubbles, the selected person's name and the editor's outline (white
   where it'll go, red where it won't, amber on what it'll clear), on top of everything.

The canvas is device resolution, so emoji and text stay sharp while pixel art
stays crisp.

## Sprites

Characters are 12×21 ASCII templates (`o` outline, `h` hair, `s` skin, `t`
shirt…) with poses for standing, walking, sitting at a desk, on a sofa, and
asleep. Hairstyles, headphones and the department badge are painted on top.
Tests check every template is the right width and front and back views are symmetric.

Vehicles (`vehicles.ts`) are all drawn by one painter from their looks in
`VEHICLES`, keyed like the sim's `MOVERS` (`car`, `truck`, `bus`). A look is:
- **`size`:** length and height side on, width end on (px, in scale with people,
  who are 21px tall), and `wheelsBelow`. Side on, every vehicle stands on its
  lane, and `wheelsBelow` nudges it up or down (cars at -2 sit centred). End on,
  it's centred across the lane.
- **`colours`:** a body and a band. Cars get a paint job from their look
  (`paintJob`), and food trucks their own colours.
- **`side` and `end`:** the rectangles that draw it, in order, as
  `[x, y, width, height, paint]`.
  - A negative position counts from the far edge. A size of zero or less is the
    whole length less that much, so parts fit if you change the size.
  - End on, a pair is `[driving away, coming towards]`.
  - `every` repeats a part along the side (the bus's windows), and `centred`
    measures x from the middle.
  - Side on, parts are drawn facing left, and mirrored facing right.

**Paint** is a role or a colour of its own:
- roles shaded from the body or band: body, highlight, cabin, door, hatch, band
- fixed roles: glass, tyre, lamps and so on
- a literal `#hex` colour

A food truck on the move is a van with its hatch shut, and opens into the full
stall (its furniture painter) once it's parked on its pitch. A car on charge
blinks a bolt.

To add a vehicle: a mover in `MOVERS` (sim: speed, reach) and a look in
`VEHICLES` by the same name, and have `vehicleKind` (`traffic.ts`) say which
cars are one.

## Camera

Drag to pan (flick it and it glides on, slowing to a stop; the world can go nearly off screen, but 64px always stays to grab it back), wheel to zoom (anchored at the cursor, easing between
steps), pinch to zoom (the map follows your fingers exactly, `pinchTo`, then eases onto the nearest crisp step when you let go, `settle`), click someone to follow them. Zoom stops at 0.5× (an overview of a
whole town), then whole steps up to 8× (halves on high-DPI screens), so pixels
stay crisp. A level's `view` tile sets where the camera starts. Moving to another level
(visiting, going through a door, following someone) keeps the zoom you chose,
except that somewhere small (filling less than half the view) zooms in until it
fills up to three quarters of it; the next bigger place goes back to your zoom.
Only the first look at a world picks one for you. Following switches level automatically when they take the stairs
or go home.
