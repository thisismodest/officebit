// The ambient music (docs/AUDIO.md), played through the Web Audio API: the
// composer writes the notes, this plays them. A warm pad, a bass, a plucked
// melody with echo and reverb, the odd high chime, and by day a soft kick and
// shaker. Everything's synthesised, so
// there are no files to load. Notes are scheduled a little ahead of time, so the
// music keeps steady time even when the page is busy.
import { BEATS_PER_BAR, Composer, frequency, type Bar, type Mood, type Note } from './composer.ts';

/** How far ahead to schedule (s), and how often to check (ms). */
const LOOKAHEAD = 0.6;
const TICK_MS = 100;
/** Overall loudness at full volume, and the ramp (s) when it's switched on or off or the volume moves: too short to hear as a fade, long enough not to click. */
const VOLUME = 0.5;
const SWITCH = 0.03;
/** Reverb length (s) and how much of the melody goes to the reverb and the echo. */
const REVERB_SECONDS = 3.5;
const REVERB_SEND = 0.35;
const ECHO_SEND = 0.22;

export class Music {
  private readonly ctx: BaseAudioContext;
  private readonly composer = new Composer();
  private readonly master: GainNode;
  private readonly dry: GainNode;
  private readonly reverb: ConvolverNode;
  private readonly echo: DelayNode;
  private nextBar = 0;
  /** Just switched on: the first chord comes in at once rather than swelling. */
  private fresh = false;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private level = 1;
  mood: Mood = { night: false };

  /** Music into `ctx`: a live AudioContext in the page, or an OfflineAudioContext to render. */
  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    // Master: gentle limiting, then the volume (which the switch turns on and off).
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    limiter.connect(this.master).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(limiter);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, REVERB_SECONDS);
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.9;
    this.reverb.connect(reverbOut).connect(limiter);

    // A dotted-eighth echo, darkening as it repeats.
    this.echo = ctx.createDelay(2);
    const feedback = ctx.createGain();
    feedback.gain.value = 0.35;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1800;
    this.echo.connect(tone).connect(feedback).connect(this.echo);
    tone.connect(limiter);
  }

  /** How loud, 0–1. Takes effect straight away if it's playing. */
  set volume(level: number) {
    this.level = level;
    if (this.timer) rampTo(this.master.gain, VOLUME * level, this.ctx.currentTime, SWITCH);
  }

  /** On, straight away, and keep the music coming. */
  start(): void {
    const now = this.ctx.currentTime;
    this.nextBar = Math.max(this.nextBar, now + 0.05);
    this.fresh = true;
    rampTo(this.master.gain, VOLUME * this.level, now, SWITCH);
    this.schedule();
    if (!this.timer) this.timer = setInterval(() => this.schedule(), TICK_MS);
  }

  /** Off, straight away, and stop writing. */
  stop(): void {
    rampTo(this.master.gain, 0, this.ctx.currentTime, SWITCH);
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Write bars until `seconds` from now (for rendering offline). */
  writeUntil(seconds: number): void {
    rampTo(this.master.gain, VOLUME * this.level, 0, SWITCH);
    this.nextBar = Math.max(this.nextBar, 0.1);
    this.writeBarsUntil(seconds);
  }

  private schedule(): void {
    this.writeBarsUntil(this.ctx.currentTime + LOOKAHEAD);
  }

  private writeBarsUntil(time: number): void {
    while (this.nextBar < time) {
      const bar = this.composer.next(this.mood);
      this.play(bar, this.nextBar);
      this.nextBar += (60 / bar.tempo) * BEATS_PER_BAR;
    }
  }

  private play(bar: Bar, start: number): void {
    const beat = 60 / bar.tempo;
    // The echo keeps time with the music: a dotted eighth.
    this.echo.delayTime.setValueAtTime(beat * 0.75, start);
    if (bar.chord) {
      const length = beat * BEATS_PER_BAR * bar.chord.bars;
      // Chords swell in over a third of their length, except the very first after switching on.
      const attack = this.fresh ? 0.15 : length * 0.35;
      this.fresh = false;
      for (const pitch of bar.chord.pad) this.pad(frequency(pitch), start, length, bar.style === 'day' ? 0.05 : 0.045, attack);
      // No bass line of its own: a held note under the chord.
      if (bar.bass.length === 0) this.bass(frequency(bar.chord.root), start, length, 0.16);
    }
    for (const note of bar.bass) this.bassNote(note, start, beat);
    // By day the tune sits a little further forward.
    for (const note of bar.melody) this.pluck(note, start, beat, bar.style === 'day' ? 1.35 : 1);
    if (bar.chime) this.chime(bar.chime, start, beat);
    if (bar.drums) {
      for (const at of bar.drums.kick) this.kick(start + at * beat);
      for (const at of bar.drums.shaker) this.shaker(start + at * beat);
    }
  }

  /** A pad note: two detuned soft tones through a low filter, swelling in (over `attack` seconds) and out. */
  private pad(hz: number, at: number, length: number, level: number, attack: number): void {
    const { ctx } = this;
    const out = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(level, at + attack);
    out.gain.linearRampToValueAtTime(level * 0.8, at + length * 0.7);
    out.gain.linearRampToValueAtTime(0, at + length + 0.8);
    filter.connect(out).connect(this.dry);
    out.connect(this.send(REVERB_SEND));
    for (const [type, cents] of [['triangle', -6], ['sine', 6]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = hz;
      osc.detune.value = cents;
      osc.connect(filter);
      osc.start(at);
      osc.stop(at + length + 1);
    }
  }

  /** The bass: a round sine on the root. */
  private bass(hz: number, at: number, length: number, level: number): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(level, at + 0.08);
    out.gain.setTargetAtTime(level * 0.6, at + 0.3, 0.8);
    out.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(out).connect(this.dry);
    osc.start(at);
    osc.stop(at + length + 0.1);
  }

  /** A bass note of the day's bouncing line: round, with a quick fall. */
  private bassNote(note: Note, bar: number, beat: number): void {
    const { ctx } = this;
    const at = bar + note.at * beat;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency(note.pitch);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(0.2 * note.velocity, at + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, at + note.length * beat + 0.15);
    osc.connect(out).connect(this.dry);
    osc.start(at);
    osc.stop(at + note.length * beat + 0.2);
  }

  /** A soft kick: a sine dropping in pitch. */
  private kick(at: number): void {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.18);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.22, at);
    out.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
    osc.connect(out).connect(this.dry);
    osc.start(at);
    osc.stop(at + 0.3);
  }

  /** A shaker: a little burst of bright noise on the off-beat. */
  private shaker(at: number): void {
    const { ctx } = this;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noise ??= noiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(0.035, at + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
    noise.connect(filter).connect(out).connect(this.dry);
    noise.start(at, Math.random());
    noise.stop(at + 0.08);
  }

  /** A melody note: a soft plucked triangle, with an octave shimmer, sent to the echo and reverb. */
  private pluck(note: Note, bar: number, beat: number, lift = 1): void {
    const { ctx } = this;
    // A touch early or late, for feel; never before the music starts.
    const at = Math.max(0, bar + note.at * beat);
    const ring = Math.max(0.5, note.length * beat + 0.7);
    const level = 0.11 * note.velocity * lift;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(level, at + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, at + ring);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, at);
    filter.frequency.exponentialRampToValueAtTime(900, at + ring);
    filter.connect(out);
    out.connect(this.dry);
    out.connect(this.send(REVERB_SEND));
    out.connect(this.send(ECHO_SEND, this.echo));
    for (const [type, octave, gain] of [['triangle', 1, 1], ['sine', 2, 0.18]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency(note.pitch) * octave;
      const g = ctx.createGain();
      g.gain.value = gain;
      osc.connect(g).connect(filter);
      osc.start(at);
      osc.stop(at + ring + 0.05);
    }
  }

  /** A chime: a pure high tone that rings on into the reverb. */
  private chime(note: Note, bar: number, beat: number): void {
    const { ctx } = this;
    const at = bar + note.at * beat;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency(note.pitch);
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, at);
    out.gain.linearRampToValueAtTime(0.05 * note.velocity, at + 0.02);
    out.gain.exponentialRampToValueAtTime(0.0001, at + 3.5);
    osc.connect(out);
    out.connect(this.send(0.8));
    out.connect(this.dry);
    osc.start(at);
    osc.stop(at + 3.6);
  }

  /** A send of `amount` into the reverb (or another effect). */
  private send(amount: number, to: AudioNode = this.reverb): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    g.connect(to);
    return g;
  }
}

/** A second of white noise, for the shaker. */
function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A reverb's impulse: stereo noise dying away over `seconds`. */
function impulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.round(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return buffer;
}

function rampTo(param: AudioParam, value: number, now: number, seconds: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + seconds);
}
