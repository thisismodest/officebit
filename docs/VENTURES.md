# Ventures

Ambitious people start side projects. Some become companies with their own
offices in town (`src/sim/ventures.ts`).

```
idea ──hustle──▶ side project ──pitch──▶ team ──launch──▶ small office ──grow──▶ big office
                      └── untouched for a week: fizzles out
```

| Stage | What happens | Moves on when |
|---|---|---|
| **Idea** | People with `ambition` ≥ 0.6 hustle at their home desk on evenings and weekends 💡 | 10 hours in: it gets a name |
| **Side project** | Members keep their day jobs and hustle after hours 🚀. At work, members pitch colleagues. | 60 hours in, on a weekday evening |
| **Building** | The founder quits (plus anyone with ambition ≥ 0.6) and works from home while a crew builds a small office on an empty lot | The builders finish |
| **Launched** | They move in and get desks | 400 hours in |
| **Rebuilding** | The small office closes, everyone works from home, and a crew builds a bigger one on the same lot | The builders finish |
| **Grown** | They move in. Keen part-timers (ambition ≥ 0.5) join, and two new people are hired. | |

A side project nobody works on for a week fizzles out.

## Pitching

When a venture member starts a chat, they may pitch (once per person every
three days). The odds rise with the listener's ambition, the pitcher's
charisma and **how well they get on** (affinity; see [RELATIONSHIPS](RELATIONSHIPS.md)).
Founders pitch better than converts. Side projects cap at four people.

## Offices

- **Lots** (`"t": "lot"` on the town map, 9×6) are where new offices go. The starter town has twelve. No free lot means no launch yet.
- Office interiors come from `worlds/offices.ts`: a four-desk studio, then an eight-desk office with a meeting room and an arcade machine.
- New offices are real companies and levels. You can visit them, follow people into them, and see their lights at night, exactly like the head office.

## Construction

Nothing appears out of thin air (`src/sim/construction.ts`). A crew of three
(`role: "crew"`, in hard hats and hi-vis) walks in from the edge of town
during working hours. When the first of them reaches the lot, the "TO LET"
sign comes down and a fenced site goes up. The site goes through four looks
as work progresses (fence, then foundations, then a steel frame, then walls
behind scaffolding). A small office takes 18 crew-hours and a big one 40
(each builder on site adds an hour an hour), so about a day and about two. At the end of each day the crew walks home,
and they're back the next morning. When the building's done they leave town
for good.

## Tuning

The thresholds are constants at the top of `ventures.ts`. `npm run probe -- 672`
runs four weeks and lists every venture event.
