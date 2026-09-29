# Interactions

`src/sim/interactions.ts`. Things you can do to the town from outside. Like
feed messages, they're inputs to the story rather than randomness, so the sim
stays deterministic.

## Office events

From each workplace's … menu in the World tab, while someone's in:

- **Order pizza.** A rider sets off from the edge of town, walks to the
  office kitchen and leaves the pizza, a treat people go out of their way
  for. It's cleared once ten slices have gone, or after two hours. Then the
  rider has gone too.
- **Fire drill.** Everyone in the building files out to the pavement and
  grass by the front door and waits there, as does anyone who turns up. After
  half an hour it's all clear, and they go back to what they were doing.

## Taking control

**Take control** (beside Follow in a profile) steers that person and follows
them. Tap someone to talk to them, furniture to use it (a bed to sleep, their
desk to work), or anywhere to walk there, on any level. They stay put between
orders. Tap the person you're steering to bring their profile back. **Let go**
in the banner (or Esc) hands them back to their personality.

In code: `sim.interactions.pizza(companyId)`, `.drill(companyId)`,
`.control(p, true)`, `.command(p, intent)`.
