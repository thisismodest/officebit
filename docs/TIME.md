# Time

## The clock

`src/sim/clock.ts`:

- 1 tick = 6 game seconds. 600 ticks = 1 game hour.
- At **1×**, one real second is one game minute, and a day is 24 minutes.
- The sim starts at **06:00 on day 1, a Monday**. Saturdays and Sundays are
  weekends: offices and schools are shut (shifts carry on), everyone lies in
  90 minutes and stays up an hour later.

Speeds in the toolbar go up to 60× (an hour a second).

## Modes

`src/ui/timekeeper.ts` decides how many steps to run each frame. The sim never
reads the wall clock; the timekeeper does.

| Mode | Clock | Controls |
|---|---|---|
| **Live** (default) | Your local date and time: a game second per real second | Pause and play |
| **Sandbox** | Starts Monday 06:00, day 1 | 1× to 60× |
| **Jumping ahead** | Tap the clock: in an hour, tomorrow at 8, next Monday, a week on, or a date and time you pick | Then carries on in Sandbox |

- **Steps and game time.** `sim.step(dt)` covers `dt` ticks of game time.
  People walk the same distance every step, so walking looks the same in every
  mode; needs, timers, work and relationships scale with `dt`. Live mode steps
  10 times a second with `dt` = 1/60 of a tick (a tenth of a game second).
- **Live** runs the town from 06:00 on the day you first opened it in this
  browser (`localStorage` key `officebit:live-since`), on the real weekday, so
  come back tomorrow and it's carried on: friendships made, ventures built.
  Opening the page fast-forwards to now before anything is drawn (up to a day
  at once; longer, a slice a frame behind the loading screen, which says how
  far it's got: about 5 seconds a month). Whenever it falls behind (the tab was
  hidden, or paused) it catches up out of sight, showing "Catching up with the
  clock…". The clock counts the days since it began (Day 1 is the day it
  started, whatever the weekday). The ▸▸ menu says when it started, with **Start afresh today**,
  which starts the town again this morning on a new seed: a new story.
  Switching to Sandbox keeps the town you have; back to Live goes back to the
  one that's been running.
- **Jumping ahead** plays out on screen at full speed, with a progress bar and
  **Stop here**, then carries on from that moment. Because the sim is deterministic,
  it's the same story the town would have lived anyway. It leaves Live mode,
  since the town is then ahead of the clock. A jump aims to take about 8
  seconds, however far (never faster than 60× for short ones, and as fast as
  the machine allows for very long ones).
  From the console: `officebit.travel(3)` (days) or
  `officebit.travel('2026-12-25T09:00')`.
- The mode is remembered in `localStorage` (`officebit:mode`).

## Routines

Each person gets hours from their traits, plus a little stable jitter
(`src/sim/schedule.ts`):

| | Diligent | Chaotic |
|---|---|---|
| Wake | earlier | later |
| Leave for work | an hour after waking | |
| Head home | later | earlier |
| Bed | earlier | later (ambitious people, later still) |

These split the day into **phases**:

| Phase | Area they choose from |
|---|---|
| `sleep` | Their bed at home |
| `home` | Their home: breakfast, cooking or takeaway, TV, family, pets |
| `work` | Their company's floors (staff and pupils: where they `works`), plus food trucks at lunch |

Awake, anyone who goes out may also pick an open venue (see
[BUILDINGS](BUILDINGS.md#venues)).

Moving between areas *is* the commute: routes run through the front door,
along the streets and up the stairs.

Family and pets keep house hours; pets nap whenever they like. Anyone with a
`shift` works it every day (`shiftRoutine`), setting off 1¼ hours before it
starts (`SHIFT_LEAD`), except at schools, which keep office weeks. Children have school hours (`schoolRoutine`): out at 07:45, home at
15:15, bed by about 20:00.

## Day and night

`daylight(hour)` fades 0→1 over 05:00–07:00 and back over 18:00–20:00. The
renderer darkens each level at night, and cuts light out around lampposts,
lit windows (someone's home and awake) and screens in use.
