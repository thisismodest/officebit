# Relationships

`src/sim/relationships.ts`. Every pair of people has two numbers:

| | Range | What it is |
|---|---|---|
| **Compatibility** | −1 to 1, fixed | How well they'd get on, given time |
| **Affinity** | −1 to 1 | How well they get on now; starts at 0 |

**Compatibility** comes from traits plus a little seeded chemistry, so it's
the same every run. Similar people (social, chaos, diligence) get on; a
diligent person and a chaotic one grate; charisma helps.

**Affinity** eases towards compatibility (plus a small nudge for familiarity)
while they chat or game together, including chats you start while in
control of someone. Being interrupted at your desk costs a little, and every
moment you're kept talking instead of working costs more, instead of
bringing you closer; both hurt more for the diligent. People who share a home start at 0.7 and are
never less compatible than 0.5. Pets, riders and visitors don't form
relationships.

| Affinity | Means | Behaviour |
|---|---|---|
| ≥ 0.5 (`FRIENDS`) | Friends | Seek each other out when free; easier to pitch a venture to |
| ≤ −0.3 (`DISLIKE`) | Don't get on | Avoid chatting; avoid tables, the cooler and so on when the other is near; walk off when the other turns up (not at home or from their desk); **have words** if they do end up talking |

Crossing either line is news ("Bea and Lou have become good friends",
"Theo and Mo have fallen out"), once, until the pair drifts well back.
Walk-offs and rows make the news at most once a day per pair.

The profile's **Relationships** section lists closest friends and anyone
they don't get on with.
