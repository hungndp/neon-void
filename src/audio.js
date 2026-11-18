// Sound, synthesised: every effect is an oscillator or a burst of noise shaped by an envelope,
// played through one WebAudio context, and under them a small sequencer loops a bass-and-pad
// score in A minor. No audio files are loaded, so the game stays silent-file and offline, and
// the effects always match the action that made them. The context is created lazily on the
// first user gesture (browsers refuse sound before one) and M mutes it.

const EFFECTS = {
  // name: [type, start frequency, end frequency, seconds, volume]
  shoot: ['square', 880, 320, 0.07, 0.05],
  enemyShoot: ['square', 340, 180, 0.09, 0.035],
  hit: ['triangle', 220, 90, 0.06, 0.08],
  explode: ['sawtooth', 160, 34, 0.32, 0.16],
  split: ['sawtooth', 240, 60, 0.22, 0.12],
  pickup: ['sine', 660, 990, 0.08, 0.07],
  levelup: ['sine', 523, 1046, 0.28, 0.12],
  dash: ['sine', 300, 900, 0.14, 0.06],
  hurt: ['sawtooth', 200, 55, 0.2, 0.16],
  ui: ['sine', 440, 660, 0.06, 0.06],
  win: ['triangle', 392, 784, 0.5, 0.12],
  over: ['triangle', 330, 65, 0.7, 0.14],
  boss: ['sawtooth', 82, 37, 0.85, 0.2],
  bossDown: ['sine', 130, 24, 0.8, 0.34],
  shield: ['square', 1250, 880, 0.05, 0.045],
};

// The score: a dark little loop in A minor at 96 BPM. A pulsing bass on sixteenth notes, a
// soft pad holding one chord a bar, a hat tick on the off-beats — all scheduled a step ahead
// by a timer and synthesised from the same oscillators as the effects. 0 in the bass line is
// a rest; the chords walk A minor, F, C and home again.
const MUSIC = {
  secondsPerBar: (60 / 96) * 4,
  bass: [55, 0, 55, 0, 55, 0, 55, 0, 55, 0, 55, 0, 65.41, 0, 49, 0],
  chords: [
    [110, 164.81, 261.63],
    [87.31, 130.81, 220],
    [98, 146.83, 246.94],
    [110, 164.81, 261.63],
  ],
};

export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let muted = false;
  let bossMode = false;
  let lastPlayed = {};
  let musicTimer = null;
  let nextBarAt = 0;
  let barCount = 0;

  /** Create the context on the first gesture; safe to call on every gesture. */
  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (Ctor === undefined) return;
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);
    noiseBuffer = context.createBuffer(1, context.sampleRate * 0.4, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    startMusic();
  }

  /** One soft note of the score, swelling in instead of the effects' instant attack. */
  function musicTone(type, freq, when, seconds, volume) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + seconds + 0.02);
  }

  /** A hat: a breath of high-passed noise, five hundredths of a second long. */
  function musicHat(when) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.016, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
    source.stop(when + 0.07);
  }

  /** Lay down one bar of the loop at the given time: bass, hats, and the bar's chord. While
   *  the boss mode is raised, the same bar gains a fight layer: the bass doubles at the
   *  octave on the off-eighths, the hats close up to a gallop, and a high spark of the
   *  chord's root lands mid-bar — a boss fight sounds like one even with your eyes shut. */
  function scheduleBar(when) {
    const step = MUSIC.secondsPerBar / 16;
    for (let index = 0; index < 16; index += 1) {
      if (MUSIC.bass[index] > 0) musicTone('triangle', MUSIC.bass[index], when + index * step, step * 0.95, 0.055);
      if (index % 4 === 2) musicHat(when + index * step);
      if (bossMode) {
        if (index % 4 === 2) musicTone('triangle', MUSIC.bass[index - 2] * 2, when + index * step, step * 0.9, 0.028);
        if (index % 2 === 0) musicHat(when + index * step);
      }
    }
    for (const freq of MUSIC.chords[barCount % MUSIC.chords.length]) {
      musicTone('sine', freq, when, MUSIC.secondsPerBar * 0.98, 0.02);
    }
    if (bossMode) {
      musicTone('sine', MUSIC.chords[barCount % MUSIC.chords.length][0] * 3, when + MUSIC.secondsPerBar * 0.5, MUSIC.secondsPerBar * 0.4, 0.011);
    }
    barCount += 1;
  }

  /**
   * Start the loop; the timer keeps a third of a second of music scheduled ahead. While muted
   * it simply holds the start line, so unmuting picks the loop up cleanly instead of bursting.
   */
  function startMusic() {
    if (musicTimer !== null) return;
    nextBarAt = context.currentTime + 0.08;
    musicTimer = setInterval(() => {
      if (muted) {
        nextBarAt = context.currentTime + 0.08;
        return;
      }
      while (nextBarAt < context.currentTime + 0.3) {
        scheduleBar(nextBarAt);
        nextBarAt += MUSIC.secondsPerBar;
      }
    }, 110);
  }

  function tone(type, from, to, seconds, volume, when) {
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), when + seconds);
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    osc.connect(gain).connect(master);
    osc.start(when);
    osc.stop(when + seconds + 0.02);
  }

  function noise(seconds, volume, when) {
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, when);
    filter.frequency.exponentialRampToValueAtTime(120, when + seconds);
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + seconds);
    source.connect(filter).connect(gain).connect(master);
    source.start(when);
    source.stop(when + seconds + 0.02);
  }

  /** Play a named effect; unknown names and a locked context are quietly skipped. */
  function play(name) {
    if (context === null || muted) return;
    const spec = EFFECTS[name];
    if (spec === undefined) return;
    const now = context.currentTime;
    // A held trigger can ask for the same effect every frame; cap each at one per 45 ms.
    if (lastPlayed[name] !== undefined && now - lastPlayed[name] < 0.045) return;
    lastPlayed[name] = now;
    tone(spec[0], spec[1], spec[2], spec[3], spec[4], now);
    if (name === 'explode' || name === 'hurt' || name === 'split' || name === 'boss' || name === 'bossDown') noise(spec[3], spec[4] * 0.7, now);
    if (name === 'levelup' || name === 'win') tone('sine', spec[1] * 1.5, spec[2] * 1.5, spec[3], spec[4] * 0.6, now + 0.09);
  }

  return {
    unlock,
    play,
    /** Raise or lower the score's fight layer; the shell calls it as the Warden comes and goes. */
    setBossMode(on) {
      bossMode = on;
    },
    /** Flip the mute and return the new state. */
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
