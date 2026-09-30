# Careers

People can lose a job, quit one, or go looking for one (`src/sim/careers.ts`).
Venture teams are exempt: they answer to themselves (see [VENTURES](VENTURES.md)).

## The Friday review (17:00)

| What | When |
|---|---|
| **Let go** | Output this week under half the team median, *and* diligence below 0.3: a 35% chance. Distractors, watch out. |
| **Quit** | Interrupted 15+ times this week, for someone with social below 0.6 (people who enjoy company don't mind): a 40% chance. |
| **A change** | Someone unambitious (ambition below 0.35) at an office: a 3% chance of handing in their notice to try something simpler. |

New starters get a week's grace before their first review. Leaving frees their desk. People between jobs spend working hours at home.

## Job hunting (weekdays, 09:00)

Anyone out of work applies, with a 50% chance a day of landing something:

1. **Their old job**, if they walked out (quit) and a desk is free.
2. **Anywhere else with a free desk**: the office, the Corner Shop's checkouts,
   the diner's grill, the school's classroom desk, any company that isn't a
   venture. Just not where they were let go (or left for a change).

Letting someone go from their profile (**Works at: Out of work**) does the same as the Friday review: they
keep their home and family and start looking the next weekday. Ambitious people
may start a side project of their own instead (see [VENTURES](VENTURES.md)).
They won't go back to the place that let them go on their own; **Works at** on
their profile gives them a job anywhere with a free desk, straight away.
`"company": ""` in a world file is someone out of work (no `company` means the
first one).

At the review, a company with free desks and nobody applying may hire a
newcomer (30% a week), who walks in from the edge of town.

## Tuning

The thresholds are constants at the top of `careers.ts`. Set `FIRE_CHANCE`
to 0 to switch firing off.
