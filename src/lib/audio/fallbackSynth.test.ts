import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isFallbackSynthSupported,
  resetSharedAudioContext,
  speakWithFormantSynth,
  wordToPhonemes,
} from '@/lib/audio/fallbackSynth';

/**
 * Minimal Web Audio fake: records the graph nodes that were created so the test
 * can assert real oscillators/noise were scheduled (not a no-op).
 */
class FakeParam {
  value = 0;
  setValueAtTime = vi.fn();
  linearRampToValueAtTime = vi.fn();
}

class FakeNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  start = vi.fn();
  stop = vi.fn();
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeBufferSource extends FakeNode {
  buffer: unknown = null;
  start = vi.fn();
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  sampleRate = 48000;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  gains: FakeGain[] = [];
  filters: FakeFilter[] = [];
  bufferSources: FakeBufferSource[] = [];
  closed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }
  createGain() {
    const node = new FakeGain();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeOscillator();
    this.oscillators.push(node);
    return node;
  }
  createBiquadFilter() {
    const node = new FakeFilter();
    this.filters.push(node);
    return node;
  }
  createBufferSource() {
    const node = new FakeBufferSource();
    this.bufferSources.push(node);
    return node;
  }
  createBuffer(_channels: number, frames: number) {
    const data = new Float32Array(frames);
    return { getChannelData: () => data };
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

describe('wordToPhonemes', () => {
  it('splits a word into vowels and consonants', () => {
    const phonemes = wordToPhonemes('cat');
    expect(phonemes.map((p) => p.type)).toEqual(['consonant', 'vowel', 'consonant']);
  });

  it('drops a final silent e but keeps an inner one', () => {
    const silent = wordToPhonemes('make');
    // m,a,k (+ silent e dropped)
    expect(silent).toHaveLength(3);
    const inner = wordToPhonemes('telephone');
    expect(inner.filter((p) => p.type === 'vowel').length).toBeGreaterThan(2);
  });

  it('ignores punctuation and digits', () => {
    expect(wordToPhonemes('abandon!').length).toBe(wordToPhonemes('abandon').length);
    expect(wordToPhonemes('123')).toHaveLength(0);
  });

  it('gives every vowel a duration and formants', () => {
    for (const phoneme of wordToPhonemes('audio')) {
      expect(phoneme.duration).toBeGreaterThan(0);
      if (phoneme.type === 'vowel') expect(phoneme.formants).toHaveLength(2);
    }
  });
});

describe('speakWithFormantSynth', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    resetSharedAudioContext();
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: FakeAudioContext,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetSharedAudioContext();
  });

  it('reports unsupported when Web Audio is missing instead of pretending', () => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(isFallbackSynthSupported()).toBe(false);
    const result = speakWithFormantSynth('abandon');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Web Audio');
  });

  it('schedules real oscillators and noise for a word', () => {
    const result = speakWithFormantSynth('abandon', { rate: 1, volume: 0.4 });
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeGreaterThan(200);

    const context = FakeAudioContext.instances.at(-1)!;
    // Each vowel makes two formant oscillators.
    expect(context.oscillators.length).toBeGreaterThanOrEqual(4);
    // Each consonant makes a noise burst.
    expect(context.bufferSources.length).toBeGreaterThanOrEqual(2);
    expect(context.oscillators[0].start).toHaveBeenCalled();
    expect(context.oscillators[0].stop).toHaveBeenCalled();
  });

  it('slow rate produces a longer duration', () => {
    const normal = speakWithFormantSynth('vocabulary', { rate: 1 });
    const slow = speakWithFormantSynth('vocabulary', { rate: 0.6 });
    expect(normal.ok && slow.ok).toBe(true);
    expect(slow.durationMs!).toBeGreaterThan(normal.durationMs!);
  });

  it('keeps the shared context alive so the next click is not silent', () => {
    vi.useFakeTimers();
    const first = speakWithFormantSynth('word');
    expect(first.ok).toBe(true);
    const contextCountAfterFirst = FakeAudioContext.instances.length;
    vi.advanceTimersByTime((first.durationMs ?? 0) + 200);

    // A second click must reuse the same context (closing it would mute audio,
    // and re-creating one outside a gesture stays `suspended`).
    const second = speakWithFormantSynth('word');
    expect(second.ok).toBe(true);
    expect(FakeAudioContext.instances.length).toBe(contextCountAfterFirst);
    expect(FakeAudioContext.instances.at(-1)!.closed).toBe(false);
  });

  it('disconnects its nodes after playback instead of leaking them', () => {
    vi.useFakeTimers();
    const result = speakWithFormantSynth('word');
    const context = FakeAudioContext.instances.at(-1)!;
    const masterGain = context.gains[0];
    vi.advanceTimersByTime((result.durationMs ?? 0) + 200);
    expect(masterGain.disconnect).toHaveBeenCalled();
  });

  it('rejects an empty word', () => {
    const result = speakWithFormantSynth('!!!');
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('字母');
  });
});
