# World format

A world is one JSON object (`WorldDef`, in `src/sim/world.ts`). It's designed
to be shared: small, plain data, never code.

```jsonc
{
  "v": 2,
  "name": "Starter town",
  "seed": 20260929,                 // same seed → same story
  "companies": [{ "id": "head", "name": "Head office", "levels": ["ground", "first"] },
                { "id": "shop", "name": "Corner Shop", "icon": "cart", "walkIn": true, "levels": ["shop"] }],
  "pantries": { "home-dev": 9 },    // meals in each kitchen (filled in if missing)
  "departments": [{ "id": "eng", "name": "Engineering", "color": "#3f74b5", "station": "computerDesk" }],
  "levels": [ /* town, office floors, homes: see BUILDINGS */ ],
  "portals": [{ "kind": "stairs", "a": { "level": "ground", "p": [19, 12] }, "b": { "level": "first", "p": [19, 12] } }],
  "spawn": { "level": "town", "p": [159, 49] },  // where people without a home come and go
  "people": [{ "id": "dev", "name": "Dev", "dept": "eng", "look": [3, 2, 3, 0], "preset": "introvert", "home": "home-dev" }],
  "npcs": [{ "id": "miso", "name": "Miso", "species": "cat", "look": [1], "home": "home-ines" }],
  "feed": { "ids": { "U024BE7LH": "dev" } },     // optional: external ids → people
  "overrides": { "venture-1-hana-office": { "size": [14, 10], "furniture": [/* … */], "rooms": [/* … */], "doors": [/* … */] } },  // optional: places the story builds, as you arranged them
  "version": "0.4.0",  // optional: the officebit version it was made with (docs/UPGRADES.md)
  "works": [{ "version": "0.4.0", "from": [2026, 9, 30, 22], "level": "town", "furniture": { "t": "billboard", "p": [40, 12] } }]  // optional: what newer releases add, for crews to put up
}
```

- **Seed:** each browser's town runs on its own seed, picked at random on the
  first visit (`localStorage` key `officebit:seed`), so everyone gets a story
  of their own. A shared link keeps the seed it carries: you see their story.
- **Ids** are how everything refers to everything else: levels, rooms (unique
  across the whole world), people, departments.
- **Positions** are tiles: `[x, y]`, top-left is `[0, 0]`.
- **Furniture ownership:** a desk or bed with `"owner": "dev"` belongs to Dev.
- **`view`** on a level is the tile the camera starts on (the starter town opens on the head office).
- **Labels** name things on the map: `{ "t": "foodTruck", "p": [10, 6], "label": "Noodle van" }`.
- **`faces: "up"`** on a house puts its door on the row above it.
- **`"love": false`** on the world, or `"romance": false` on a person, keeps
  them out of love stories (see [LOVE](LOVE.md)).
- The sim edits its own copy of the world as it runs (new offices, new hires),
  so it can be saved and shared mid-story.

## Validation

`validate(world)` (`src/sim/validate.ts`) returns a list of problems:

- duplicate or dangling ids
- unknown furniture types; furniture off the edge, in a wall, or overlapping
  other solid furniture
- furniture nobody can reach
- portals or the spawn on unwalkable tiles
- levels no door or stairs lead to
- homes without a bed
- companies pointing at levels that aren't office floors or venues
- NPCs whose `home` isn't a home; staff who don't work at a venue or school;
  children whose `works` isn't a school

An empty list means the world is sound. The starter world is tested to stay that way.
