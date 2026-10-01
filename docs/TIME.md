# Time

## The clock

`src/sim/clock.ts`:

- 1 tick = 6 game seconds. 600 ticks = 1 game hour.
- At **1×**, one real second is one game minute, and a day is 24 minutes.
- A new sim starts at **06:00 on day 1, a Monday** (the timekeeper moves it to today's weekday: see Modes). Saturdays and Sundays are
  weekends: offices and schools are shut (shifts carry on), everyone lies in
  90 minutes and stays up an hour later.

Speeds in the toolbar go up to 60× (an hour a second).

## Modes

`src/ui/timekeeper.ts` decides how many steps to run each frame. The sim never
reads the wall clock; the timekeeper does.

| Mode | Clock | Controls |
|---|---|---|
| **Live** (default) | Your local date and time: a game second per real second | Pause and play |
| **Sandbox** | Starts 06:00 today, or on a day you pick (tap the clock: **Another day**) | 1× to 60× |
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
- **Another day**, under jumping ahead, starts a fresh town in Sandbox at 06:00
  on any date: to see the town at Halloween or Christmas without waiting.
- The mode is remembered in `localStorage` (`officebit:mode`).

## The calendar

`src/sim/calendar.ts`. The story's first day has a date (`sim.calendar.start`:
Live's start day, or Sandbox's), and every day after it follows on, so
`sim.dateOf(tick)` is a real date. The timekeeper sets it, with where the town
is (`ui/whereabouts.ts`: your timezone's city, its hours from UTC, and whether
its clocks go forward, by the EU, US or southern-hemisphere rule). Everything
after that is arithmetic, not `Date`, so the sim stays deterministic.
Until a timekeeper sets it (tests, the probe) it's London from 1 June 2026.

## Holidays

`src/sim/holidays.ts` has the fixed dates; `src/sim/festivities.ts` what the
town does on them. `sim.dayOff()` (the weekend, or a bank holiday) is what
offices, schools, crews, food trucks and routines go by.

| Day | What happens |
|---|---|
| **Bank holidays**: Christmas Day, Boxing Day, New Year's Day | Offices and schools shut, lie-ins, like a Sunday. One at a weekend moves to the next weekday (the UK way) |
| **December** (1st to 5 January) | A council crew puts the Christmas tree up on the Green (lit at night) and takes it down after Twelfth Night (if the Green's full, it goes on the nearest grass). Every lived-in home and each office puts up its own tree, in the sitting room (someone who's there does it, one evening; at work, in the day), and takes it down in January. Houses get a wreath on the door, and after dark fairy lights round the roof and the tree glowing in the window. A story that starts in December has them all up already |
| **The office party** (last working day before Christmas) | From 15:00 nobody at an office works: drinks and chat |
| **Christmas Day** | 🎁 presents at 09:00 and 🍗 dinner at 13:00 in every home with someone in (fun, social, fed) |
| **New Year's Eve** | Grown-ups stay up past midnight, and it's a night out (the diner's busy); from 23:15 they head out to the Green, round the tree, for the fireworks at midnight, and drift home after half past |
| **Bonfire Night** (5 November) | A crew builds a bonfire on the Green in the day; from 17:30 the whole town can walk over (it's an `event`: the town's in everyone's area), and it's lit till 23:00; fireworks 19:00–21:00; cleared away the next day |
| **Halloween** | Pumpkins on the doorsteps all week; 17:30–19:30 children go door to door trick-or-treating |
| **Valentine's Day** | Asking someone out and date nights three times as likely |
| **Midsummer** | Grown-ups stay up till after midnight |
| **April Fools' Day** | The most chaotic person at work pulls a prank at 11:00 |

To see one without waiting: tap the clock, **Another day**, and pick the date.

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

`sim.daylight()` follows the real sun where the town is: sunrise and sunset
for the date (NOAA's approximation), with 45 minutes of dawn and dusk either
side, and an hour's shift when the clocks change. In London that's dark by
16:00 in December and light until after 21:00 in June. The renderer darkens each level at night, and cuts light out around lampposts,
lit windows (someone's home and awake) and screens in use.

## Weather

`sim/weather.ts`: clear, grey, rain or snow, in four-hour spells, from the
world's seed and the date alone (the same weather for everyone, and looking
never changes the story). About a quarter of June's spells are wet and over a
third of winter's, and in December to February some of them snow; snow lies on
the grass for half a day after it stops. Wet weather keeps people in: anything
outdoors (the park, a bench on the Green, a food truck, a stroll) appeals less
the harder it's coming down, and something fun indoors a little more; plans for
the park are mostly off (one in seven goes ahead anyway). The World tab's Today
says when it's grey, raining or snowing. In the rain about two in three carry an
umbrella (`hasUmbrella`, the same for them every time, drawn up over them out of
doors); the rest hurry to get out of it.
