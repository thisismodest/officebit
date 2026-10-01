# Upgrades

`src/worlds/upgrades.ts` and `src/sim/works.ts`.

Your town is your own copy of the design: once you've changed anything, or
opened someone's link, it's saved in your browser (or the link), and the
starter town can change without it. So when a release adds something to the
starter town (billboards, a bus stop), older towns get it too, **built by a
crew**, because nothing appears out of thin air.

## How it goes

1. **Versions.** Every town records the version it was made with (`version`
   in the world; `VERSION` in `upgrades.ts`, the same as `package.json`'s).
   Towns saved before versions were recorded count as 0.3.
2. **Opening an older town.** Each newer release's pieces become `works` in the
   design, dated the hour you opened it, and the town's version moves up. A
   piece whose spot you've used (anything of yours on its footprint or its
   works) is left out; your changes always win.
3. **The crew.** When the story reaches that hour, a crew is sent for each
   piece (`construction.ts`). They come in working hours, fence off a patch,
   put it up in about four crew-hours, and go ("🚧 A crew came to put up a
   billboard", "🏗️ The new billboard is up"). If something's been put there
   since, they don't come.
4. **Replays.** A Live town replays its story each time it opens, and the works
   are part of the design, so the crew comes at the same moment every time.
   Once they've been, the pieces are simply there.

A new town from the starter already has everything, so no crews.

## The move

0.5 has a new map. A town made before it moves onto it (`relocate.ts`): its people,
families and pets, the insides of its buildings and homes (edits included) all come; each
home goes on a plot of its size if there's one; plots left over are homes to let; new places
(the leisure centre) come with their company and staff. Changes to the old town map itself
don't come: that map's gone. A test moves the real 0.4 town (`test/fixtures/town-0.4.json`).

## Shipping something new

When a release adds furniture to the starter town:

1. Put it in the town as usual (`starter.config.ts`).
2. Add the release to `UPGRADES`: its version, and each piece's level and
   furniture.
3. Pick spots that were clear in the last release's town (a test checks it for
   the starter town's own pieces, and `validate()` runs on the result).
4. Bump the version ([DEVELOPING](DEVELOPING.md#deploying)).

Only furniture for now. New rooms, roads or buildings would need their own
kind of works.
