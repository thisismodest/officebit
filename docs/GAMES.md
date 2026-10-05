# Games

Mini games, for fun (and for younger players): `src/games/`. Click something with a `minigame` in the catalog and its
card has a big Play button. Games never touch the town's story: they read the town at most, and keep their own state
(best scores in the browser). While you play, a Live town carries on behind you; a Sandbox town waits.

| Where | What |
|---|---|
| `pixel.ts` | Pixel art for the controls and cards: the joystick's arrows (square, chunky buttons) and the stars. |
| `arcade/game.ts` | What an arcade game is, and drawing on its screen a pixel at a time (text, boxes, lines, outlines, discs). |
| `controls.ts` | Arrows or WASD, space or Enter (the ◆ go button: the screens say "◆ / SPACE"), the on-screen joystick, and swipes and taps on a screen. A game in play has the keys to itself; Escape backs out. Keys are tracked by where they are (`event.code`), and everything held is let go if the window loses focus, the tab's hidden or ⌘/Ctrl goes down (a Mac doesn't say when keys come up then), so nothing sticks. |
| `cabinet.ts` | The arcade cabinet every arcade game plays in. |
| `arcade/` | One file per arcade game, its rules and its drawing. |
| `town/` | Games played out in the town, and their runner. |
| `index.ts` | `Games`: what `main.ts` starts; `MINIGAMES`: what each card says (and why it can't be played from there just now, if it can't). |

## The arcade

An arcade machine (`arcade`, `minigame: 'arcade'`) opens the cabinet: a marquee (ARCADE, in pixel letters), a little screen (160×144, scaled up
crisp) and a panel with a joystick and a ◆ go button (space or Enter on a keyboard). The screen shows a picture menu of the games (arrows and ◆, or tap
one), then the game; game over shows the score and the best, and ◆ plays again. Back (the ✕ on the marquee, or Escape) goes
from a game to the menu, and from the menu back to town. A round left part way still counts towards the best.

An arcade game is an `ArcadeGame` (`arcade/game.ts`): a name, an icon, a line on how to play, and `start(random)`,
which gives a `Round` to step (`step(input, dt)`), draw, score and end. Its rules are plain code, tested without a
screen (`test/games.test.ts`). Names and art are our own: the ideas are classics, the names aren't theirs.

### Caterpillar

Snake: eat leaves to grow (and go a touch quicker); running into the garden wall or into itself ends a round. It starts
slow. It answers the stick at once: a turn pressed partway through a move is taken then,
and two quick presses (up, then left) are both taken, one a move.

### Brick Bash

Breakout: a wide bat (arrows, or under your finger), the ball waiting on it till you press ◆ (or space); three balls; a cleared
wall goes up again a little quicker.

### Space Rocks

Asteroids: left and right turn the ship, up pushes it on, ◆ (or a tap) fires. A rock that's hit breaks in two, smaller and
quicker; the smallest crumble away (smaller rocks score more). Off one edge is on at the other. Three ships, each new one
blinking a moment while it can't be hit; a clear sky brings a new wave, one rock more.

### Bubble Blaster

A bubble shooter: aim the launcher (left and right, or a finger on the screen) and fire (◆, or let go of the screen).
Bubbles bounce off the sides and stick in a honeycomb; three or more of a colour together pop, and any left hanging with
nothing holding them up fall, for twice the points. Every seven shots that pop nothing, the lot comes down a row (the pips
say how many shots are left); reaching the line ends the round. The launcher only gets colours still up there; clear them
all for a bonus and a fresh lot.

### Cross the Road

Frogger, with the town's own cars and buses: hop a row or a column a press (a tap or ◆ is a hop forward), across three lanes,
a pavement in the middle, and three more. Mid-hop you're in the air; land in front of something and it's one of three
goes, back to the start. Each crossing scores, and the traffic gets a little quicker.

## Town games

Played on the real town map, as a layer drawn over it (`renderer.overlays`), by `town/runner.ts`: a bar along the top
(what to do, chips for how it's going, the time, an arrow which way), the camera on you (or left to you, in a game about
looking round: drag the map, or the arrows), and a joystick for fingers in a game you steer. A game can ask for the map
closer (never further out than you had it). The map still zooms (scroll, pinch, the zoom buttons); a tap on it goes to the
game. Started from a signpost, furniture like any other (in the editor under **Fun & games**), so a town can have them
anywhere; if it can't be played from where it is just now (no road near a Parcel Dash signpost), its card says why.

A town game is a `TownGameDef`: its title, whether it's steered, and `plan(sim, from, random)`, a `TownRound` to step,
paint, show in the bar and finish with stars. Its rules are a plain class, tested without the town.

### Parcel Dash

From its signpost (`parcelDash`; the starter town's is by the parcel depot), a van on the nearest road and a parcel
for each of three houses near it the van can reach: bobbing over the door in its colour, with a ring on the kerb
outside. Hold a direction to drive; at a junction it turns the way you're pressing (pressed early, it drives on to a
turning just ahead, or on while you hold its way too, and otherwise waits). It goes at a van's pace, the movement engine's own (`MOVERS.van`), so it keeps up with the
traffic, and twice as fast on the highway. On a wide road, pressing up or down (or left
or right, going up and down) moves it across into the next lane, to get past a bus: which side of the road is up to
you. Drive into a vehicle (each a box: its length along the way it faces, a lane wide) and it's a crash, once, as you
touch: a burst of pixels, the van knocked back and stopped a moment, and 5 seconds on the time. Then you can drive off. Pull up in the ring to deliver. All three
delivered: one to three stars, by time, drawn in pixels.

### Find it

From the noticeboard (`findIt`; the starter town's is on the Green by the path): someone from town (anyone who lives or
works there, pets too), their picture and name in the bar. It's pretend: if they're out and about it's the real them;
if not, the game stands a stand-in of them (drawn by it, like Catch!'s thrower) somewhere outdoors within 30 tiles of the
noticeboard, on grass, a path or sand. Out for real while you look, and it's the real them; gone in, and their stand-in
stays where they were. Look round and tap them (near enough counts); tap someone else and the bar says who that is.
Three to find, never the same one twice running. Fifteen seconds on one, and a gold ring closes in round them with an
arrow pointing their way. Stars by time. It only looks at the town: nobody knows they're wanted.

### Catch!

From the ball tub (`ballTub`, on the Green): you on the grass beside it, a friend as far off as the grass goes. Ten throws,
each to grass a good way from the thrower and near enough to you to get there comfortably (from wherever you are when
it's thrown, allowing a moment to see where it's going, and not at a flat-out run), its shadow (and a square) where it'll land, darker as it comes down; run there
(the stick, or tap where to run) and be within reach when it does. Each throw's a little quicker. Stars by catches: eight
for three, five for two. The game zooms the map in to play.

## Adding a game

An arcade game: a file in `arcade/` exporting an `ArcadeGame`, added to `ARCADE` in `cabinet.ts` (the menu fits five; more
would need it to scroll). A town game: its rules and its `TownGameDef` in `town/`, added to `TOWN_GAMES` in `index.ts`, a
`minigame` value in the catalog with a signpost type and painter (`render/props/games.ts`), and its card in `MINIGAMES`.
