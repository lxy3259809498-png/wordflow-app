/**
 * Built-in English fallback synthesiser.
 *
 * Why this exists: many Windows/Android installs ship only Chinese system
 * voices, so `speechSynthesis` cannot speak English at all. Relying on the OS
 * means "no sound" for a large share of users. This module synthesises an
 * intelligible English word with Web Audio formant tones — no network, no
 * licence issues, and it always produces sound when audio output exists.
 *
 * It is deliberately a *last* fallback: real recorded audio wins, then the
 * system voice (natural), then this.
 */

/** Rough grapheme→phoneme map for English spelling. Not a full G2P engine. */
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

interface Phoneme {
  type: 'vowel' | 'consonant';
  /** Base frequency for vowels, or noise burst centre for consonants. */
  freq: number;
  duration: number;
  /** Vowel formants (F1, F2) for a more speech-like timbre. */
  formants?: [number, number];
}

const VOWEL_TABLE: Record<string, [number, number, number]> = {
  // vowel → [F1, F2, duration]
  a: [730, 1090, 0.13],
  e: [530, 1840, 0.11],
  i: [270, 2290, 0.1],
  o: [570, 840, 0.13],
  u: [300, 870, 0.12],
  y: [300, 2200, 0.09],
};

const CONSONANT_TABLE: Record<string, [number, number]> = {
  // consonant → [noise centre Hz, duration]
  b: [300, 0.05],
  c: [2200, 0.07],
  d: [400, 0.05],
  f: [4000, 0.07],
  g: [350, 0.05],
  h: [1500, 0.05],
  j: [2500, 0.06],
  k: [2400, 0.07],
  l: [900, 0.05],
  m: [250, 0.06],
  n: [300, 0.06],
  p: [350, 0.05],
  q: [2400, 0.06],
  r: [1100, 0.05],
  s: [5000, 0.08],
  t: [2600, 0.05],
  v: [3500, 0.06],
  w: [700, 0.05],
  x: [3500, 0.08],
  z: [4500, 0.07],
};

/** Split a word into a simple phoneme sequence; silent 'e' is dropped. */
export function wordToPhonemes(word: string): Phoneme[] {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '').split('');
  const out: Phoneme[] = [];
  letters.forEach((letter, index) => {
    const isLast = index === letters.length - 1;
    if (VOWELS.has(letter)) {
      const [f1, f2, duration] = VOWEL_TABLE[letter] ?? [500, 1500, 0.11];
      // Final silent 'e' (as in "make") is not pronounced on its own.
      if (letter === 'e' && isLast && letters.length > 2) return;
      out.push({ type: 'vowel', freq: f1, duration, formants: [f1, f2] });
      return;
    }
    const [freq, duration] = CONSONANT_TABLE[letter] ?? [1500, 0.05];
    out.push({ type: 'consonant', freq, duration });
  });
  return out;
}

export interface FallbackSynthOptions {
  rate?: number;
  volume?: number;
  onEnded?: () => void;
}

export interface FallbackSynthResult {
  ok: boolean;
  reason?: string;
  /** Milliseconds the synthesised word takes. */
  durationMs?: number;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function isFallbackSynthSupported(): boolean {
  return getAudioContextCtor() !== null;
}

/**
 * Long-lived context, created **inside a user gesture** by `primeAudioContext()`.
 *
 * Why: browsers start an AudioContext created outside a gesture in `suspended`
 * state, which produces silence while our code still reports success. Reusing
 * one context that was unlocked by a click avoids the whole class of bug.
 */
let sharedContext: AudioContext | null = null;

/**
 * Call directly from a click/tap handler (no `await` before it) to unlock audio.
 * Returns the context state so callers can be honest about whether sound will
 * actually come out.
 */
export function primeAudioContext(): AudioContextState | 'unsupported' {
  const Ctor = getAudioContextCtor();
  if (!Ctor) return 'unsupported';
  if (!sharedContext) {
    try {
      sharedContext = new Ctor();
    } catch {
      return 'unsupported';
    }
  }
  if (sharedContext.state === 'suspended') {
    // Fire and forget: the resume is queued within the gesture.
    void sharedContext.resume().catch(() => {});
  }
  return sharedContext.state;
}

export function getSharedAudioContext(): AudioContext | null {
  return sharedContext;
}

/** Test hook: drop the cached context between cases. */
export function resetSharedAudioContext(): void {
  sharedContext = null;
}

/**
 * Speaks a word using formant synthesis. Returns the real duration so callers
 * can keep "speaking" state accurate, and never throws on a missing audio API.
 */
export function speakWithFormantSynth(
  word: string,
  options: FallbackSynthOptions = {},
): FallbackSynthResult {
  const Ctor = getAudioContextCtor();
  if (!Ctor) {
    return { ok: false, reason: '当前浏览器不支持 Web Audio，无法使用内置发音。' };
  }
  const phonemes = wordToPhonemes(word);
  if (phonemes.length === 0) {
    return { ok: false, reason: '没有可合成的字母。' };
  }
  // `slow` roughly halves the speed.
  const rate = Math.min(1.6, Math.max(0.4, options.rate ?? 1));
  const volume = Math.min(1, Math.max(0, options.volume ?? 0.35));

  // Reuse the gesture-unlocked context when available. Creating a fresh one
  // here (after awaits) is what silently muted the previous implementation.
  let context: AudioContext;
  if (sharedContext && sharedContext.state !== 'closed') {
    context = sharedContext;
    if (context.state === 'suspended') {
      void context.resume().catch(() => {});
    }
  } else {
    try {
      context = new Ctor();
    } catch (error) {
      return { ok: false, reason: `无法创建音频上下文：${(error as Error).message}` };
    }
    sharedContext = context;
  }

  const now = context.currentTime;
  let cursor = now;
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);

  for (const phoneme of phonemes) {
    const duration = phoneme.duration / rate;
    if (phoneme.type === 'vowel' && phoneme.formants) {
      // Two formant oscillators → vowel-like tone.
      const [f1, f2] = phoneme.formants;
      for (const [index, freq] of [f1, f2].entries()) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq * (1 + index * 0.002);
        gain.gain.setValueAtTime(0, cursor);
        gain.gain.linearRampToValueAtTime(index === 0 ? 0.5 : 0.25, cursor + duration * 0.25);
        gain.gain.linearRampToValueAtTime(0, cursor + duration);
        osc.connect(gain);
        gain.connect(master);
        osc.start(cursor);
        osc.stop(cursor + duration);
      }
    } else {
      // Consonants: short filtered noise burst.
      const frames = Math.max(1, Math.floor(context.sampleRate * duration));
      const buffer = context.createBuffer(1, frames, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < frames; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = phoneme.freq;
      filter.Q.value = 1.2;
      const gain = context.createGain();
      gain.gain.value = 0.45;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start(cursor);
    }
    cursor += duration;
  }

  const durationMs = Math.round((cursor - now) * 1000);
  // Disconnect the nodes when done, but keep the shared context alive: closing
  // it would make the next click silent (and re-creation needs a gesture).
  window.setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      // Already disconnected — nothing to do.
    }
    options.onEnded?.();
  }, durationMs + 120);

  return { ok: true, durationMs };
}
