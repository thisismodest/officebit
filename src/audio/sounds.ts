// Sound effects (docs/AUDIO.md#sounds), synthesised like the music: a food
// truck's horn, the shop's till and tannoy, the diner's bell, an office's
// keyboards, coffee machine, water cooler, arcade and phones, a fire alarm, and
// the murmur of people talking. Each is short and soft, and can be panned
// towards where it happened on screen.

/** Overall level of the effects at full volume. */
const LEVEL = 0.55;

export type SoundName = 'horn' | 'till' | 'tannoy' | 'bell' | 'key' | 'phone' | 'coffee' | 'cooler' | 'arcade' | 'alarm' | 'alarmMuffled';

/** Vowel formants (Hz), for the murmur of talking. */
const VOWELS: [number, number][] = [
  [730, 1090],
  [530, 1840],
  [270, 2290],
  [570, 840],
  [440, 1020],
  [660, 1720],
];

export class Sounds {
  private readonly ctx: BaseAudioContext;
  private readonly out: GainNode;
  private noise: AudioBuffer | null = null;

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    this.out = ctx.createGain();
    this.out.gain.value = LEVEL;
    this.out.connect(limiter).connect(ctx.destination);
  }

  /** How loud, 0–1. */
  set volume(level: number) {
    this.out.gain.value = LEVEL * level;
  }

  /** Play a sound now (or `delay` seconds from now), panned -1 (left) to 1 (right). */
  play(name: SoundName, pan = 0, delay = 0): void {
    const at = this.ctx.currentTime + delay + 0.01;
    const bus = this.bus(pan);
    ({
      horn: () => this.horn(bus, at),
      till: () => this.till(bus, at),
      tannoy: () => this.tannoy(bus, at),
      bell: () => this.bell(bus, at),
      key: () => this.key(bus, at),
      phone: () => this.phone(bus, at),
      coffee: () => this.coffee(bus, at),
      cooler: () => this.cooler(bus, at),
      arcade: () => this.arcade(bus, at),
      alarm: () => this.alarm(bus, at, false),
      alarmMuffled: () => this.alarm(bus, at, true),
    })[name]();
  }

  /**
   * A phrase of talking, heard across the room: vowel-ish syllables at a
   * speaker's pitch (Hz), rising and falling, muffled so no words come through.
   */
  speak(pitch: number, syllables: number, pan = 0, delay = 0, volume = 1): void {
    const bus = this.bus(pan);
    const room = this.filter('lowpass', 1400, bus, 0.5);
    let at = this.ctx.currentTime + delay + 0.01;
    for (let i = 0; i < syllables; i++) {
      const length = 0.08 + Math.random() * 0.12;
      // A phrase lifts in the middle and falls away at the end, like speech does.
      const contour = 1 + 0.12 * Math.sin((i / Math.max(1, syllables - 1)) * Math.PI) - (i === syllables - 1 ? 0.08 : 0);
      const [f1, f2] = VOWELS[Math.floor(Math.random() * VOWELS.length)]!;
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.05 * volume, at + length * 0.3);
      env.gain.linearRampToValueAtTime(0, at + length);
      env.connect(room);
      // The voice through two formant filters: that's what makes it sound like a vowel.
      for (const [hz, gain] of [[f1, 1], [f2, 0.5]] as const) {
        const level = this.ctx.createGain();
        level.gain.value = gain;
        level.connect(env);
        const voice = this.tone('sawtooth', pitch * contour, at, length, this.filter('bandpass', hz, level, 5));
        voice.frequency.linearRampToValueAtTime(pitch * contour * 0.97, at + length);
      }
      at += length + (Math.random() < 0.2 ? 0.12 : 0.02);
    }
  }

  /** "Beep beep": two short, friendly honks of a two-note horn. */
  private horn(bus: AudioNode, at: number): void {
    for (const start of [at, at + 0.22]) {
      const filter = this.filter('lowpass', 1600, bus);
      const env = this.envelope(filter, start, 0.01, 0.12, 0.13);
      for (const hz of [392, 494]) this.tone('sawtooth', hz, start, 0.16, env);
    }
  }

  /** The till: a mechanical "ka", then a bright "ching". */
  private till(bus: AudioNode, at: number): void {
    this.burst(at, 0.03, 'bandpass', 1400, 0.25, bus);
    for (const [hz, level] of [[2637, 0.09], [3951, 0.05], [5274, 0.03]] as const) {
      const env = this.envelope(bus, at + 0.06, 0.003, level, 0.7);
      this.tone('sine', hz, at + 0.06, 0.75, env);
    }
  }

  /** The shop's announcement chime: "ding-dong", through a little speaker. */
  private tannoy(bus: AudioNode, at: number): void {
    const speaker = this.filter('bandpass', 1100, bus, 0.8);
    for (const [hz, start] of [[659, at], [523, at + 0.55]] as const) {
      const env = this.envelope(speaker, start, 0.01, 0.16, 1.3);
      this.tone('sine', hz, start, 1.35, env);
      const shine = this.envelope(speaker, start, 0.01, 0.04, 0.8);
      this.tone('sine', hz * 2, start, 0.85, shine);
    }
  }

  /** The diner's service bell: coffee's ready. */
  private bell(bus: AudioNode, at: number): void {
    for (const [hz, level, ring] of [[2093, 0.1, 1.4], [5230, 0.035, 0.6]] as const) {
      const env = this.envelope(bus, at, 0.002, level, ring);
      this.tone('sine', hz, at, ring + 0.05, env);
    }
  }

  /** One key on a keyboard: a soft, low tap rather than a click. */
  private key(bus: AudioNode, at: number): void {
    this.burst(at, 0.01, 'bandpass', 1300 + Math.random() * 900, 0.026 + Math.random() * 0.014, bus);
  }

  /** A fire alarm sounder: two tones, alternating. Muffled, it's the one in the building you're outside. */
  private alarm(bus: AudioNode, at: number, muffled: boolean): void {
    const out = muffled ? this.filter('lowpass', 500, bus) : bus;
    const level = muffled ? 0.03 : 0.05;
    [0, 1, 2, 3].forEach((i) => {
      const start = at + i * 0.25;
      const env = this.envelope(this.filter('lowpass', 2500, out), start, 0.01, level, 0.24);
      this.tone('square', i % 2 ? 790 : 970, start, 0.25, env);
    });
  }

  /** A desk phone's gentle trill, twice. */
  private phone(bus: AudioNode, at: number): void {
    for (const ring of [0, 0.7]) {
      [880, 1109, 1319, 1109].forEach((hz, i) => {
        const start = at + ring + i * 0.07;
        const env = this.envelope(bus, start, 0.005, 0.05, 0.12);
        this.tone('triangle', hz, start, 0.14, env);
      });
    }
  }

  /** The coffee machine: a rising hiss of steam. */
  private coffee(bus: AudioNode, at: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(700, at);
    filter.frequency.linearRampToValueAtTime(1800, at + 1.6);
    filter.connect(bus);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.1, at + 0.5);
    env.gain.linearRampToValueAtTime(0, at + 1.8);
    env.connect(filter);
    this.noiseSource(at, 1.9).connect(env);
  }

  /** The water cooler: three bubbles, rising. */
  private cooler(bus: AudioNode, at: number): void {
    for (const [i, hz] of [180, 230, 290].entries()) {
      const start = at + i * 0.13;
      const env = this.envelope(bus, start, 0.005, 0.09, 0.09);
      const osc = this.tone('sine', hz, start, 0.1, env);
      osc.frequency.exponentialRampToValueAtTime(hz * 1.8, start + 0.08);
    }
  }

  /** An arcade machine: a quick rising arpeggio of blips. */
  private arcade(bus: AudioNode, at: number): void {
    [660, 880, 1320, 1760].forEach((hz, i) => {
      const start = at + i * 0.06;
      const env = this.envelope(this.filter('lowpass', 3000, bus), start, 0.002, 0.04, 0.05);
      this.tone('square', hz, start, 0.06, env);
    });
  }

  // ── Building blocks ────────────────────────────────────────────────────────

  private bus(pan: number): AudioNode {
    const panner = this.ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    panner.connect(this.out);
    return panner;
  }

  private tone(type: OscillatorType, hz: number, at: number, length: number, to: AudioNode): OscillatorNode {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    osc.connect(to);
    osc.start(at);
    osc.stop(at + length);
    return osc;
  }

  /** A gain that rises to `level` over `attack`, then dies away over `decay`. */
  private envelope(to: AudioNode, at: number, attack: number, level: number, decay: number): GainNode {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    env.connect(to);
    return env;
  }

  private filter(type: BiquadFilterType, hz: number, to: AudioNode, q = 1): BiquadFilterNode {
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = hz;
    filter.Q.value = q;
    filter.connect(to);
    return filter;
  }

  /** A short burst of filtered noise: clicks, the till's "ka". */
  private burst(at: number, length: number, type: BiquadFilterType, hz: number, level: number, to: AudioNode): void {
    const env = this.envelope(this.filter(type, hz, to, 1.5), at, 0.001, level, length);
    this.noiseSource(at, length + 0.02).connect(env);
  }

  private noiseSource(at: number, length: number): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise ??= whiteNoise(this.ctx);
    source.start(at, Math.random() * 0.5);
    source.stop(at + length);
    return source;
  }
}

function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
