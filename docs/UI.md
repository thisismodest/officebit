# UI

Native HTML styled by [modest-ui](https://modest-ui.com) (`mdst-ui`), over the
canvas. Modules live in `src/ui/`.

| Piece | Module | What it does |
|---|---|---|
| **The town** | `public/index.html` | The town is the site's front page (`officebit.town/`), share links and all (`/#w=…`). |
| **About page** | `public/about/index.html`, `landing.css` | What officebit is, on a card over the town's grass (`grass.png`, a tile of it), with three townsfolk strolling along the paving at the top (still, under reduced motion), a screenshot and **Open your town** (coming back, **Back to your town**). The menu bar's officebit leads here. |
| **Welcome card** | `welcome.ts` | On a first visit, in the middle of the map: a sentence on what this is, **Look around** and **About officebit**, and What's new. The **?** at the end of the tool rail brings it back. |
| **Loading screen** | `index.html`, `style.css` | Plain HTML and CSS, so it shows before any script runs: three pixel people walking round a spinner. `main.ts` removes it 300 ms after the town's first frame is drawn; coming back to a Live town, it shows how far catching up has got ("Catching up on the town… {time}") first. Still under reduced motion. |
| **Menu bar and floating controls** | `index.html`, `main.ts` | A slim bar along the top, like a Mac's: officebit on the left, where you're looking in the middle, and on the right the clock (tap to jump ahead, `time-jump.ts`), music and sounds (the speaker; see [AUDIO](AUDIO.md)), play/pause, the sidebar toggle (wide screens: fold it away to have the whole window for the town; remembered), and ▸▸ for Live/Sandbox and the speeds. Over the map: the tool rail top left (Back, Town, edit, save and share, and **?** for the welcome card; the editor takes its place while editing), zoom bottom right (hidden on phones: pinch, which follows your fingers smoothly and settles on a crisp zoom when you let go) with **full screen** above it (`fullscreen.ts`: the whole page, sidebar and all; Esc comes back out; hidden where the browser can't, as on iPhones, and in the installed app, which has the screen to itself: [DEVELOPING](DEVELOPING.md#the-app)), and a chip top centre while you're following someone. Popovers share `popover.ts`; icons are `icons.ts`. |
| **Editor** | `editor.ts` | The floating map toolbar: move, add and delete furniture, move buildings, draw roads and paths (see [BUILDER](BUILDER.md)) |
| **Save and share** | `share-menu.ts` | Save in the browser, copy a link, download or open a file, start again |
| **World tab** | `overview.ts` | The town at a glance, with line icons: Today (workday or weekend, who's up, who's asleep), each workplace, school and venue with who's there, ventures and building work, homes, homes to let and low kitchens. The arrow (Visit) jumps to a place; a workplace with people in has a **…** menu to order pizza or run a fire drill. |
| **People tab** | `directory.ts` | Everyone, including family, pets, staff and crews. Search, and group by where they are, where they work or who they live with. Click to open their profile and follow them, wherever they are. |
| **News tab** | `news.ts` | The event log, newest first. With someone selected, **Only {name}** narrows it to their story. |
| **Profile** | `profile.ts` | A slide-out over the stage for whoever's selected: portrait, what they're doing, needs, personality, their day, home and household, love and venture, what's happened to them lately, relationships, what they're thinking about (their top brain options) and their stats so far. Everyone but crews and passers-by has a button to take control ([INTERACTIONS](INTERACTIONS.md)). The team, their families and pets also have **Edit**, which swaps the sections for a form ([PEOPLE](PEOPLE.md#editing)). Follow, take control and edit are icon buttons under the name, pressed while they're on. |
| **Building card** | `place-card.ts` | Click a building: name, who's in, a Visit button per floor. Click a door or stairs (`exitAt` in `sim/places.ts`): **To {place}**, which takes you through to where it comes out. Click a billboard or bus-stop poster: the spotlight it's showing, its line, a **Spotlight** badge and **Visit {site} ↗** (a new tab). |
| **Controls** | `controls.ts` | Drag (flick to glide), wheel or pinch to zoom, click, keyboard: arrows or WASD pan, `+`/`-` zoom, `f` follows whoever's selected, Esc stops following, space pauses (`main.ts`) |

Shared wording lives in `describe.ts` (what someone's doing, where) and
`who.ts` (role, household, routine, option labels).

"What they're thinking" asks the brain for its scored options through
`sim.peek()`, which restores the random state afterwards, so looking at
someone never changes the story (tested).

Every event names who it involved (`sim.log(text, who)`), and the sim keeps
the last 40 per person (`sim.historyOf(id)`), so an argument shows up in
both people's stories.

**Back** (the arrow at the top of the tool rail, or Alt+←) returns to the view
you were on before you last opened someone or went somewhere (`history.ts`):
a person comes back selected and followed, wherever they are now; a place just
as you left it. It keeps 30 steps, counts the same person twice running once,
and starts afresh with a new town.

`officebit.look(level, x, y)` points the camera at a tile.

On phones and small tablets (60rem and narrower) the sidebar is a sheet along
the bottom with icon tabs (tap a tab to open it, tap it again to fold it away),
and the profile slides up from below, with the camera keeping whoever's
followed in the part of the map still showing. Buttons are finger-sized on
touch screens. Editing folds the sheet away, and the furniture picker is a strip
beside the toolbar (see [BUILDER](BUILDER.md)). The editor's toolbar and the
status, picker and room card beside it are laid out side by side, so they never
overlap, however big the buttons are. A long press on the map or the controls just presses: no text selection, no menu.

States are kept simple: rows tint on hover and get a bar down the side when
selected, with dark text throughout; buttons are bordered; names in text are
links (`button.link`). Zooming while following stays centred on the person.

`officebit.follow(id)` in the console does what clicking a directory row does.
