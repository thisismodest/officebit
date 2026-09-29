# Needs

Four meters from 0 (desperate) to 1 (fine), in `src/sim/needs.ts`.

| Need | Drains | Refilled by |
|---|---|---|
| `energy` | 0.08/hour (×1.3 at a desk) | Sleep, coffee, sofas |
| `hunger` | 0.09/hour | Fridge, dining tables, cooking, takeaway |
| `social` | 0.18/hour × (0.2 + social) | Chatting, eating together, the water cooler, pets |
| `fun` | 0.15/hour × (0.2 + chaos) | Chatting (a little), wandering, pets, TV, arcades, interrupting (for the chaotic) |

Asleep, energy recovers (0.14/hour) and the rest drain at 30% speed.

**Urgency** is `(1 − need)²`: a half-full need barely registers, a nearly
empty one dominates. Brains weigh options by urgency (see
[PERSONALITIES](PERSONALITIES.md)), so people only leave their desks when
something is actually running low.

## Groceries

Each home has a **pantry**, measured in meals (`world.pantries`, 14 when full).
At home, cooking uses a meal and a snack from the fridge uses half. With too
little in, you can't cook, so it's a takeaway or the diner. Below 4 meals,
someone who lives there heads to the Corner Shop (07:00–22:00 daily, while
someone's minding it: see [BUILDINGS](BUILDINGS.md#venues)) and restocks it
to full. That's usually once or twice a week.

Rates are per **game hour** (see [TIME](TIME.md)). Furniture `offers` are the
total restored by one use, spread across its duration.
