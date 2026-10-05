// Mini games (docs/GAMES.md): the arcade cabinet and the games played out in the town, started by clicking something
// with a `minigame` (an arcade machine, a Parcel Dash signpost). Purely for fun: nothing here touches the town's story.
import type { FurnitureType } from '../sim/catalog.ts';
import type { Tile } from '../sim/world.ts';
import { Cabinet } from './cabinet.ts';
import { TownGame, type TownHost } from './town/runner.ts';

export type Minigame = NonNullable<FurnitureType['minigame']>;

/** What the card says when you click one. */
export const MINIGAMES: Record<Minigame, { title: string; about: string; play: string }> = {
  arcade: { title: 'Arcade machine', about: 'Caterpillar, Brick Bash and more.', play: '🎮 Play' },
  parcelDash: { title: 'Parcel Dash', about: 'Drive the parcel van and deliver to the houses!', play: '📦 Play' },
};

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

  /** Play what was clicked, there: false if it can't be played from here (no road near a signpost, say). */
  play(game: Minigame, at: Tile): boolean {
    if (this.playing) return false;
    if (game === 'arcade') {
      this.cabinet.show(this.host.hold());
      return true;
    }
    return this.town.start(at);
  }
}
