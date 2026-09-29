# Love

`src/sim/love.ts`, with moving house in `src/sim/housing.ts`.

## Who

Single, grown-up humans with a home. Never children or crews, never anyone
who already lives with a partner, and never anyone with `"romance": false`.
A world with `"love": false` has no love stories at all; use that for a world
modelling real colleagues.

## How it goes

1. **A spark.** A fixed, seeded 40% of pairs have one; the rest stay friends.
2. **Asking out.** When two good friends (affinity ≥ 0.5, see
   [RELATIONSHIPS](RELATIONSHIPS.md)) with a spark get talking, one may ask:
   "💘 Theo asked Bea out, and they said yes".
3. **Dating.** Until they move in, on about half of evenings a couple has a
   date night from 18:00 (three and a half hours): the diner pulls hard, and so does their date once they're both
   there ("💞 … are on a date at The Night Owl Diner"). Being in love lifts
   where their affinity is heading by 0.3.
4. **Moving in.** After a week, if their affinity is ≥ 0.75, they move in
   together (at 10:00). They take the bigger of their homes. If both are
   terraces, or there are children to fit in, they take a bigger house that's
   to let ("🏡 … moved in together, into a bigger house"). Family and pets come
   along.
5. **Splitting up.** Below 0.2 it's over ("💔 … have split up"). If they lived
   together, one moves into a home that's to let, if there is one. The starting
   households are married and never split.

## Moving house

A house on the town map (`terrace`, `house`, `detached`) leads to a home
level. `Housing` knows which is which, who lives where, and what's empty. An
empty home is named **To let**; a lived-in one after its residents ("Bea and
Lou's house"). Moving updates the world's `home` fields too, so a saved world
stays true.

The starter town builds a house on every spare plot, empty and to let, so
there's somewhere to move to. Newcomers hired from out of town take the
smallest one that's free.

The profile's **Life** section shows who someone is seeing or living with.
