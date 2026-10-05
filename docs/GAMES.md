# Games

Mini games, for fun (and for younger players): `src/games/`. Click something with a `minigame` in the catalog and its
card has a big Play button. Games never touch the town's story: they read the town at most, and keep their own state
(best scores in the browser). While you play, a Live town carries on behind you; a Sandbox town waits.

| Where | What |
|---|---|
| `pixel.ts` | Pixel art for the controls and cards: the joystick's arrows (square, chunky buttons) and the stars. |
| `controls.ts` | Arrows or WASD, space or Enter (the ◆ go button: the screens say "◆ / SPACE"), the on-screen joystick, and swipes and taps on a screen. A game in play has the keys to itself; Escape backs out. Keys are tracked by where they are (`event.code`), and everything held is let go if the window loses focus, the tab's hidden or ⌘/Ctrl goes down (a Mac doesn't say when keys come up then), so nothing sticks. |
| `cabinet.ts` | The arcade cabinet every arcade game plays in. |
| `arcade/` | One file per arcade game, its rules and its drawing. |
| `town/` | Games played out in the town, and their runner. |
| `index.ts` | `Games`: what `main.ts` starts; `MINIGAMES`: what each card says. |

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

## Town games

Played on the real town map, as a layer drawn over it (`renderer.overlays`), with the camera on you, a bar along the top
and a joystick for fingers (`town/runner.ts`). The map still zooms (scroll, pinch, the zoom buttons); clicks on it are
ignored while you play. Started from a signpost, furniture like any other (in the editor under
**Fun & games**), so a town can have them anywhere.

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

## Adding a game

An arcade game: a file in `arcade/` exporting an `ArcadeGame`, added to `ARCADE` in `cabinet.ts`. A town game: its
rules and painting in `town/`, a `minigame` value in the catalog with a signpost type and painter
(`render/props/games.ts`), and its card in `MINIGAMES`.
