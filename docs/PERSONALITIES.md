# Personalities

## Traits

Five sliders, 0–1 (`src/sim/personality.ts`):

| Trait | High means |
|---|---|
| `social` | Needs company sooner; drawn to crowds. Low: repelled by them. |
| `diligence` | Starts early, works longer, shrugs off interruptions. |
| `chaos` | Bored easily, wanders, finds interrupting people *fun*. Orders takeaway. |
| `charisma` | Pulls other people towards them. |
| `ambition` | Hustles on side projects; may found a company (see [VENTURES](VENTURES.md)). |

**Presets** are just named trait values; `traits` on a person overrides any of them.

| Preset | Plays out as |
|---|---|
| `regular` | Works, gets coffee, chats a bit |
| `introvert` | Slips away from groups to somewhere quiet |
| `magnet` | Where they go, a crowd forms |
| `distractor` | Roams the floor interrupting whoever's focused |
| `workhorse` | At the desk early and late, until hunger wins |
| `founder` | Hustles every evening and pitches to anyone who'll listen |

## How a brain decides

`PersonalityBrain` (`src/sim/brain.ts`) runs whenever someone finishes what
they were doing:

1. **Work out the phase:** sleep, home or work (see [TIME](TIME.md)). Feed
   status can override it (see [FEEDS](FEEDS.md)).
2. **List options** allowed in that phase's area: their desk, furniture
   (including food trucks at lunch, and any open venue for an outing), chatting to someone, wandering,
   retreating from a crowd, and in the evening their side project.
   At home a sofa by the TV can mean a takeaway (at most daily) or games,
   depending on who they are.
3. **Score each one:** mostly *how much it helps their most urgent need*
   (see [NEEDS](NEEDS.md)), weighted by traits, minus walking distance, plus
   crowd and charisma effects and a little noise. Swings and hopscotch
   (`play` furniture) tempt grown-ups too when one's close by and they're
   feeling playful: the more chaotic, and the shorter of fun, the more.
   Needing the food shop while it's waiting for its staff means queuing
   outside (see [BUILDINGS](BUILDINGS.md#venues)).
4. **Pick the best.** `brain.options(p, sim)` returns the full scored list,
   which is handy for debugging (call it inside `sim.peek()`, so looking
   doesn't change the story).

Every 20 steps the sim also *rethinks*: people stop if it's now the wrong
time of day, if an introvert is crowded, if a need has become an emergency
at the desk, or if someone they can't stand turns up (see
[RELATIONSHIPS](RELATIONSHIPS.md)). Each kind of person says whether it
applies (`rethink` in [PEOPLE](PEOPLE.md#kinds)).

## Other brains

Anything implementing `Brain` can drive a person:

```ts
interface Brain { decide(person: Person, sim: Simulation): Intent }
sim.setBrain('dev', myBrain);
```

`PetBrain` is the simplest example; `StaffBrain` and `CrewBrain` are the others. An LLM-backed or remote-controlled brain
would plug in the same way.
