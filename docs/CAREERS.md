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

1. **Their old job**, if they walked out (quit) and a desk is free. The let-go and the change-seekers aren't taken back.
2. **A walk-in employer** (`"walkIn": true` on a company, like the Corner Shop), which takes anyone.

At the review, a company with free desks and nobody applying may hire a
newcomer (30% a week), who walks in from the edge of town.

## Tuning

The thresholds are constants at the top of `careers.ts`. Set `FIRE_CHANCE`
to 0 to switch firing off.
