# Architecture

```
 WorldDef (JSON) ──▶ Simulation ──state──▶ Renderer (canvas)
                       ▲    │                 Sidebar + profile (DOM)
      Feeds ──status───┘    └──events──▶ News tab
```

| Folder | Role |
|---|---|
| `src/sim/` | The simulation. Pure TypeScript, no DOM. |
| `src/render/` | Draws one level at a time through a camera. Reads sim state, never writes it. |
| `src/ui/` | Sidebar (overview, directory, news), profiles and editing people, building cards, the map editor, controls, full screen (see [UI](UI.md)). |
| `src/feeds/` | The feed protocol and in-page transports. |
| `src/worlds/` | The starter world and helpers for building levels in code. |

## The sim

- **Fixed step.** `sim.step(dt)` advances `dt` ticks (default 1; a tick is 6
  game seconds). The page runs 10 steps per real second (see [TIME](TIME.md#modes)).
- **Deterministic.** Same world + same seed + same feed messages → the same
  story. All randomness comes from seeded streams: `sim.rng`, and traffic's
  own, so cars never change the story.
- **Brains decide, the sim executes.** A `Brain` returns an `Intent` ("use item
  12", "chat with bea", "sleep"). The sim routes the person there, runs timers,
  applies needs, handles conversations. See [PERSONALITIES](PERSONALITIES.md).

Key files:
- `sim.ts`: the loop, walking people to their intents, and world editing.
- `intents.ts`: what each intent does. `roles.ts`: each kind of person.
  `person.ts`: runtime state. See [PEOPLE](PEOPLE.md#kinds).
- `brain.ts`: decisions. `social.ts`: conversations and what comes of them. `plans.ts`: friends' days out together.
- `movement.ts`: how anything moves (the movers, their speeds and manners, what blocks
  them, one stepper), and `collision.ts`, who's in whose way (bodies in the sim's
  `space`). See [MOVEMENT](MOVEMENT.md).
- `navigation.ts`: routes across levels. `grid.ts`: one level's tiles and A*.
- `geometry.ts`: tile, rectangle and footprint maths, door rows and portal ends, shared by the sim, the world builders and the editor.
- `roads.ts`, `traffic.ts`, `visitors.ts`: cars. See [TRAFFIC](TRAFFIC.md).
  `food-trucks.ts`: the lunch trucks, as traffic on a timetable. `arrivals.ts`:
  new family members coming home (a baby by car).
- `calendar.ts`: the date of any tick, and the sun where the town is.
  `holidays.ts` and `festivities.ts`: the days of the year, and what the town does
  on them. See [TIME](TIME.md#the-calendar).

Everything else that runs each step or each hour (ventures, careers, love,
housing, interactions, construction, festivities, food trucks, arrivals) is a
small class the sim owns, with a back-reference to it.

## Rendering

Rendering interpolates between the last two ticks, so movement is smooth at
any frame rate. Static things (floors, walls, furniture sprites) are painted
once and cached; each frame composes them with people, bubbles and lighting.

## Adding things

- **A furniture type:** a catalog entry plus a painter. See [FURNITURE](FURNITURE.md).
- **A behaviour:** usually a new option scored in `brain.ts`, sometimes a new
  `Intent` kind with its entry in `intents.ts`.
- **A kind of person:** a role in `world.ts` and its entry in `roles.ts`.
  Someone passing through (like a visitor) also gets a small module that
  brings them in, gives them a brain, and sees them off.
- **A data source:** a feed, not code. See [FEEDS](FEEDS.md).
