// Music and sounds (docs/AUDIO.md): the speaker in the menu bar opens two
// switches, both off until you turn them on, each with its own volume, and all
// remembered. Whatever was on
// last time starts as the page opens, or, if the browser holds sound back until
// you tap or press a key, with your first one. A hidden tab goes quiet.
import { Music } from '../audio/music.ts';
import { Sounds } from '../audio/sounds.ts';
import { icon } from './icons.ts';
import { popover } from './popover.ts';

type Channel = 'music' | 'sounds';
const KEY: Record<Channel, string> = { music: 'officebit:music', sounds: 'officebit:sounds' };
const VOLUME_KEY: Record<Channel, string> = { music: 'officebit:music-volume', sounds: 'officebit:sounds-volume' };
const LABEL: Record<Channel, string> = { music: 'Music', sounds: 'Sounds' };
/** Volume out of 100, until you move a slider. */
const DEFAULT_VOLUME = 100;

export class AudioMenu {
  private readonly button: HTMLElement;
  private readonly panel: HTMLElement;
  private ctx: AudioContext | null = null;
  private music: Music | null = null;
  private effects: Sounds | null = null;
  private readonly on: Record<Channel, boolean> = {
    music: localStorage.getItem(KEY.music) === 'on',
    sounds: localStorage.getItem(KEY.sounds) === 'on',
  };
  private readonly volume: Record<Channel, number> = { music: storedVolume('music'), sounds: storedVolume('sounds') };

  constructor(button: HTMLElement) {
    this.button = button;
    this.panel = document.createElement('div');
    this.panel.className = 'audio-menu popover mdst-card mdst-card--compact';
    this.panel.hidden = true;
    this.panel.innerHTML = (['music', 'sounds'] as const)
      .map(
        (channel) => `
      <label><input type="checkbox" data-channel="${channel}"> ${LABEL[channel]}</label>
      <input type="range" min="0" max="100" step="5" data-volume="${channel}" value="${this.volume[channel]}" aria-label="${LABEL[channel]} volume" title="${LABEL[channel]} volume">`,
      )
      .join('');
    button.after(this.panel);
    popover(button, this.panel);
    this.panel.addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.channel) this.set(input.dataset.channel as Channel, input.checked);
      if (input.dataset.volume) localStorage.setItem(VOLUME_KEY[input.dataset.volume as Channel], input.value);
    });
    // Volume follows the slider as you drag it.
    this.panel.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.volume) this.setVolume(input.dataset.volume as Channel, Number(input.value));
    });

    if (this.on.music || this.on.sounds) {
      // Start straight away: browsers often allow it on a site you've used before. If this one
      // holds the sound back until you tap or press a key, the first one lets it go.
      for (const channel of ['music', 'sounds'] as const) if (this.on[channel]) this.set(channel, true);
      const first = () => {
        void this.ctx?.resume();
        removeEventListener('pointerdown', first);
        removeEventListener('keydown', first);
      };
      if (this.ctx?.state !== 'running') {
        addEventListener('pointerdown', first);
        addEventListener('keydown', first);
      }
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else if (this.on.music || this.on.sounds) void this.ctx.resume();
    });
    this.show();
  }

  /** The sound effects, if they're on. */
  sounds(): Sounds | null {
    return this.on.sounds ? this.effects : null;
  }

  /** After dark, the music turns to its calm night style. */
  set night(night: boolean) {
    if (this.music) this.music.mood = { night };
  }

  private set(channel: Channel, on: boolean): void {
    this.on[channel] = on;
    localStorage.setItem(KEY[channel], on ? 'on' : 'off');
    if (on) {
      this.ctx ??= new AudioContext();
      void this.ctx.resume();
      if (channel === 'music') {
        this.music ??= new Music(this.ctx);
        this.music.volume = this.volume.music / 100;
        this.music.start();
      } else {
        this.effects ??= new Sounds(this.ctx);
        this.effects.volume = this.volume.sounds / 100;
      }
    } else if (channel === 'music') this.music?.stop();
    this.show();
  }

  private setVolume(channel: Channel, volume: number): void {
    this.volume[channel] = volume;
    if (channel === 'music' && this.music) this.music.volume = volume / 100;
    if (channel === 'sounds' && this.effects) this.effects.volume = volume / 100;
  }

  private show(): void {
    const any = this.on.music || this.on.sounds;
    this.button.innerHTML = icon(any ? 'sound' : 'muted');
    const label = `Music ${this.on.music ? 'on' : 'off'}, sounds ${this.on.sounds ? 'on' : 'off'}`;
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
    for (const input of this.panel.querySelectorAll<HTMLInputElement>('[data-channel]')) input.checked = this.on[input.dataset.channel as Channel];
  }
}

function storedVolume(channel: Channel): number {
  const stored = Number(localStorage.getItem(VOLUME_KEY[channel]) ?? DEFAULT_VOLUME);
  return Number.isFinite(stored) ? Math.max(0, Math.min(100, stored)) : DEFAULT_VOLUME;
}
