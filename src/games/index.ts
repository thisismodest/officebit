// Mini games (docs/GAMES.md): the arcade cabinet and the games played out in the town, started by clicking something
// with a `minigame` (an arcade machine, a game's signpost). Purely for fun: nothing here touches the town's story.
import type { FurnitureType } from '../sim/catalog.ts';
import type { Tile } from '../sim/world.ts';
import { Cabinet } from './cabinet.ts';
import { CATCH } from './town/catch.ts';
import { FIND_IT } from './town/find-it.ts';
import { PARCEL_DASH } from './town/parcel-dash.ts';
import { TownGame, type TownGameDef, type TownHost } from './town/runner.ts';

export type Minigame = NonNullable<FurnitureType['minigame']>;

/** What the card says when you click one, and if it can't be played from there just now, why not. */
export const MINIGAMES: Record<Minigame, { title: string; about: string; play: string; cant: string }> = {
  arcade: {
    title: 'Arcade machine',
    about: 'Five games: Caterpillar, Brick Bash, Space Rocks, Bubble Blaster and Cross the Road.',
    play: '🎮 Play',
    cant: '',
  },
  parcelDash: { title: 'Parcel Dash', about: 'Drive the parcel van and deliver to the houses!', play: '📦 Play', cant: 'There are no houses to deliver to from here.' },
  findIt: { title: 'Find it', about: 'Someone’s out and about in town. Can you find them?', play: '🔍 Play', cant: 'There’s nobody in town to find.' },
  catch: { title: 'Catch!', about: 'A friend throws, you run and catch. How many can you get?', play: '⚾ Play', cant: 'There’s no grass to play on here.' },
};

/** The games played out in the town. */
const TOWN_GAMES: Record<Exclude<Minigame, 'arcade'>, TownGameDef> = { parcelDash: PARCEL_DASH, findIt: FIND_IT, catch: CATCH };

export class Games {
  private readonly cabinet: Cabinet;
  private readonly town: TownGame;
  private readonly host: TownHost;

  constructor(host: TownHost) {
    this.host = host;
    this.cabinet = new Cabinet(host.stage);
    this.town = new TownGame(host);
  }

  /** Is a game on screen? */
  get playing(): boolean {
    return this.cabinet.open || this.town.playing;
  }

  /** Play what was clicked, there: false if it can't be played from here (no road near a signpost, nobody in town to find). */
  play(game: Minigame, at: Tile): boolean {
    if (this.playing) return false;
    if (game === 'arcade') {
      this.cabinet.show(this.host.hold());
      return true;
    }
    return this.town.start(TOWN_GAMES[game], at);
  }

  /** A tap on the map while a town game's on: to the game. */
  tap(clientX: number, clientY: number): void {
    if (this.town.playing) this.town.tap(clientX, clientY);
  }
}
