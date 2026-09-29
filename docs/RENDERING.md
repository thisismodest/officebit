# Rendering

Canvas 2D, 16 px tiles, stepped zoom ([Camera](#camera)) with smoothing off. Everything is drawn
in code; the only image file is the favicon (`public/favicon.svg`).

| Module | Draws |
|---|---|
| `tiles.ts` | A level's static layer: floors, 3/4-view walls, shadows, doorways |
| `props/` | Furniture sprites (see [FURNITURE](FURNITURE.md)) |
| `characters.ts` | People: ASCII templates, palette-swapped, cached |
| `pets.ts` | Cats and dogs, side-on |
| `cars.ts` | Cars from above, in a few paint jobs, and their lights |
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
   top; then moving cars' head and tail lights on top of the dark.
4. Speech bubbles, the selected person's name and the editor's outline (white
   where it'll go, red where it won't, amber on what it'll clear), on top of everything.

The canvas is device resolution, so emoji and text stay sharp while pixel art
stays crisp.

## Sprites

Characters are 12×21 ASCII templates (`o` outline, `h` hair, `s` skin, `t`
shirt…) with poses for standing, walking, sitting at a desk, on a sofa, and
asleep. Hairstyles, headphones and the department badge are painted on top.
Tests check every template is the right width and front and back views are symmetric.

Cars (`cars.ts`) are one cached sprite per paint job and direction, sized to
sit inside a one-tile lane; a car on charge blinks a bolt.

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
