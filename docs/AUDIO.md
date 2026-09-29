# Audio

Music and sounds, both off until you turn them on: the speaker in the menu bar
opens two switches (`src/ui/audio-menu.ts`), each with a volume slider. All
four are remembered (`localStorage` keys `officebit:music`, `officebit:sounds`,
and `…-volume` for each, 0–100). Whatever was on
last time starts as the page opens; if the browser holds sound back until you
tap or press a key (it often does on a site you haven't used much), it starts
with your first one, and the first chord comes straight in rather than swelling. Switching either on or off is instant (a 30 ms ramp, just enough not to
click). A hidden tab goes quiet.

Everything is synthesised with the Web Audio API: no files.

| Part | Module | Does |
|---|---|---|
| **Composer** | `src/audio/composer.ts` | Writes the music, a bar at a time. Pure and seeded, so it's tested. |
| **Player** | `src/audio/music.ts` | Plays it: voices, effects, and a look-ahead scheduler that keeps steady time. |
| **Effects** | `src/audio/sounds.ts` | The sound effects. |
| **Soundscape** | `src/ui/soundscape.ts` | Decides which effects play, for the place you're looking at. |

## The music

In D major pentatonic throughout, so nothing clashes. The melody walks in
small steps, lands on chord tones on the strong beats, sometimes echoes a bar
from the phrase before, and settles on a chord tone at the end of every
four-bar phrase. Sections of two phrases alternate sparse and fuller, so the
loop never sounds like one. Two styles, following the town's clock; the style
only changes at the start of a phrase:

| | Day | Night (after dusk) |
|---|---|---|
| Tempo | 96 bpm | 72 bpm |
| Chords | D6, G6/9, Bm7, Asus, one a bar | Dmaj7, Bm7, Gmaj7, Asus, two bars each |
| Melody | Busier, short and bouncy, the odd upward leap | Sparse, notes ringing on, plenty of rests |
| Bass | Bouncing root and fifth | Held under the chord |
| Drums | A soft kick and a shaker on the off-beats | None |

Voices: a warm pad, a sine bass, a plucked triangle melody with an octave
shimmer, the odd high chime. Effects: a generated reverb, a dotted-eighth echo
that keeps time and darkens as it repeats, and a limiter. It averages about
−25 dBFS, peaking around −12.

To hear it without the page: `new Music(new OfflineAudioContext(…))`, set
`mood`, then `writeUntil(seconds)` renders it offline.

## Sounds

Only for the place you're looking at, panned towards where it happened, and
quiet while paused or jumping ahead. A sound that's just played is skipped if
it comes again straight away, so busy moments don't pile up.

| Where | Sound | When |
|---|---|---|
| Town | Horn, "beep beep" | A food truck pulls up |
| Corner Shop | Till, "kerching" | Someone pays for their shopping |
| Corner Shop | Tannoy, "ding-dong" | Every minute or so |
| Diner | Service bell | A coffee or a meal is ready |
| Offices (head office, startups) | Keyboards | People at their desks type in bursts of a few soft keys, then pause (at most four typing at once) |
| Anywhere | Talking | Conversations murmur back and forth, each person in their own voice; indoors (not at home), a busy room (three or more) hums with the odd distant phrase. It's muffled, like chatter across a room: no words come through. |
| The building being drilled | Fire alarm | A two-tone sounder for the whole drill; muffled from the street |
| Wherever there's one | Coffee machine hiss, water cooler glug, arcade blips | Someone uses one |
| Offices | Phone | Every minute or two, while someone's working |

The sim tells the soundscape when someone starts using something
(`sim.onUse`); listeners mustn't change the story.

Next: music that follows who you're watching (someone deep in focus, a crowd
at the diner).
