import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserPronunciationService,
  bestPhonetic,
  hasRecordedAudio,
} from '@/lib/audio/pronunciationService';

/**
 * These tests simulate the browser speech engine. The critical regression they
 * lock down: Chrome reports `getVoices() === []` on first call, so a service
 * that decides "no voices" immediately would never speak on a real machine.
 */

type Listener = () => void;

interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

class FakeSynth {
  voices: FakeVoice[] = [];
  spoken: { text: string; rate: number; voice: FakeVoice | null; lang: string }[] = [];
  cancelled = 0;
  private listeners = new Set<Listener>();

  getVoices(): SpeechSynthesisVoice[] {
    return this.voices as unknown as SpeechSynthesisVoice[];
  }
  speak(utterance: SpeechSynthesisUtterance): void {
    this.spoken.push({
      text: utterance.text,
      rate: utterance.rate,
      voice: utterance.voice as unknown as FakeVoice | null,
      lang: utterance.lang,
    });
    // Real engines fire onstart asynchronously.
    setTimeout(() => {
      utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
      setTimeout(() => utterance.onend?.(new Event('end') as SpeechSynthesisEvent), 5);
    }, 0);
  }
  cancel(): void {
    this.cancelled += 1;
  }
  addEventListener(_type: string, listener: Listener): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: string, listener: Listener): void {
    this.listeners.delete(listener);
  }
  /** Simulates the async voice list arriving (Chrome behaviour). */
  loadVoicesLater(voices: FakeVoice[], delay = 20): void {
    setTimeout(() => {
      this.voices = voices;
      for (const listener of this.listeners) listener();
    }, delay);
  }
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  src = '';
  playbackRate = 1;
  preload = '';
  crossOrigin: string | null = null;
  currentTime = 0;
  ended = false;
  paused = false;
  onerror: (() => void) | null = null;
  onended: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  playImpl: () => Promise<void> = () => Promise.resolve();
  constructor() {
    FakeAudio.instances.push(this);
  }
  play(): Promise<void> {
    // Mimic a real element: metadata → playing → ended.
    this.onloadedmetadata?.();
    return this.playImpl().then(() => {
      this.onplaying?.();
      setTimeout(() => {
        this.ended = true;
        this.onended?.();
      }, 5);
    });
  }
  pause(): void {
    this.paused = true;
  }
}

const US_VOICE: FakeVoice = { name: 'Google US English', lang: 'en-US', localService: false, default: true };
const UK_VOICE: FakeVoice = { name: 'Google UK English Female', lang: 'en-GB', localService: false, default: false };

function installFakeEnvironment() {
  const synth = new FakeSynth();
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, writable: true, value: synth });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: class {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      pitch = 1;
      volume = 1;
      onstart: ((event: Event) => void) | null = null;
      onend: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  });
  Object.defineProperty(window, 'Audio', { configurable: true, writable: true, value: FakeAudio });
  FakeAudio.instances = [];
  return synth;
}

function word(overrides: Record<string, unknown> = {}) {
  return {
    term: 'abandon',
    audioUS: null,
    audioUK: null,
    phonetic: '/əˈbændən/',
    phoneticUS: '/əˈbændən/',
    phoneticUK: '/əˈbændən/',
    ...overrides,
  } as { term: string; audioUS: string | null; audioUK: string | null; phonetic: string; phoneticUS: string; phoneticUK: string };
}

describe('BrowserPronunciationService — voice loading', () => {
  let synth: FakeSynth;
  let service: BrowserPronunciationService;

  beforeEach(() => {
    synth = installFakeEnvironment();
    service = new BrowserPronunciationService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('waits for voiceschanged instead of failing on an empty initial list', async () => {
    // Chrome reports [] first; voices arrive ~20ms later.
    expect(synth.getVoices()).toHaveLength(0);
    synth.loadVoicesLater([US_VOICE, UK_VOICE], 20);

    const result = await service.speak('abandon', { accent: 'US', speed: 'normal' });

    expect(result.ok).toBe(true);
    expect(result.source).toBe('tts');
    expect(result.voiceName).toBe('Google US English');
    expect(synth.spoken).toHaveLength(1);
  });

  it('falls back to the built-in synthesiser when the device has no English voice', async () => {
    // jsdom has no Web Audio, so the fallback reports why it could not run —
    // the important part is that we never claim success without a mechanism.
    const result = await service.speak('abandon', { accent: 'US', speed: 'normal' });
    expect(result.ok).toBe(false);
    expect(['no-voices', 'empty-text']).toContain(result.code);
    expect(result.reason).toBeTruthy();
    expect(result.source).toBeUndefined();
  });
});

describe('BrowserPronunciationService — accent selection', () => {
  let synth: FakeSynth;
  let service: BrowserPronunciationService;

  beforeEach(async () => {
    synth = installFakeEnvironment();
    synth.voices = [US_VOICE, UK_VOICE];
    service = new BrowserPronunciationService();
    await service.ensureVoices();
  });

  afterEach(() => vi.restoreAllMocks());

  it('picks an en-US voice for the US accent', async () => {
    const result = await service.speak('abandon', { accent: 'US', speed: 'normal' });
    expect(result.voiceLang).toBe('en-US');
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Google US English');
  });

  it('picks an en-GB voice for the UK accent', async () => {
    const result = await service.speak('abandon', { accent: 'UK', speed: 'normal' });
    expect(result.voiceLang).toBe('en-GB');
    expect(synth.spoken.at(-1)?.voice?.name).toBe('Google UK English Female');
  });

  it('falls back to another English voice and says so when the accent is missing', async () => {
    // Only a US voice installed, learner asked for UK.
    synth.voices = [US_VOICE];
    const result = await service.speak('abandon', { accent: 'UK', speed: 'normal' });
    expect(result.ok).toBe(true);
    expect(result.usedFallbackVoice).toBe(true);
    expect(result.voiceLang).toBe('en-US');
  });
});

describe('BrowserPronunciationService — speed + cancel', () => {
  let synth: FakeSynth;
  let service: BrowserPronunciationService;

  beforeEach(async () => {
    synth = installFakeEnvironment();
    synth.voices = [US_VOICE];
    service = new BrowserPronunciationService();
    await service.ensureVoices();
  });

  afterEach(() => vi.restoreAllMocks());

  it('really changes the utterance rate in slow mode', async () => {
    await service.speak('abandon', { accent: 'US', speed: 'normal' });
    await service.speak('abandon', { accent: 'US', speed: 'slow' });
    const [normal, slow] = synth.spoken;
    expect(normal.rate).toBe(0.95);
    expect(slow.rate).toBe(0.55);
    expect(slow.rate).toBeLessThan(normal.rate);
  });

  it('cancels the previous utterance before starting a new one', async () => {
    const before = synth.cancelled;
    await service.speak('abandon', { accent: 'US', speed: 'normal' });
    await service.speak('benefit', { accent: 'US', speed: 'normal' });
    expect(synth.cancelled).toBeGreaterThan(before);
    expect(synth.spoken).toHaveLength(2);
  });

  it('stop() cancels speech', () => {
    const before = synth.cancelled;
    service.stop();
    expect(synth.cancelled).toBe(before + 1);
  });
});

describe('BrowserPronunciationService — recorded audio', () => {
  let synth: FakeSynth;
  let service: BrowserPronunciationService;

  beforeEach(async () => {
    synth = installFakeEnvironment();
    synth.voices = [US_VOICE];
    service = new BrowserPronunciationService();
    await service.ensureVoices();
  });

  afterEach(() => vi.restoreAllMocks());

  it('prefers recorded audio when the word has one', async () => {
    const result = await service.speak('abandon', {
      accent: 'US',
      speed: 'normal',
      word: word({ audioUS: 'https://example.com/abandon-us.mp3' }),
    });
    expect(result.ok).toBe(true);
    expect(result.source).toBe('recorded');
    expect(synth.spoken).toHaveLength(0);
    expect(FakeAudio.instances.at(-1)?.src).toBe('https://example.com/abandon-us.mp3');
  });

  it('uses the UK audio URL for the UK accent', async () => {
    await service.speak('abandon', {
      accent: 'UK',
      speed: 'normal',
      word: word({ audioUS: 'https://example.com/us.mp3', audioUK: 'https://example.com/uk.mp3' }),
    });
    expect(FakeAudio.instances.at(-1)?.src).toBe('https://example.com/uk.mp3');
  });

  it('falls back to TTS when the audio URL fails, and explains why', async () => {
    const original = FakeAudio.prototype.play;
    FakeAudio.prototype.play = function play(this: FakeAudio) {
      this.onerror?.();
      return Promise.reject(new Error('网络错误'));
    };
    try {
      const result = await service.speak('abandon', {
        accent: 'US',
        speed: 'normal',
        word: word({ audioUS: 'https://example.com/broken.mp3' }),
      });
      expect(result.ok).toBe(true);
      expect(result.source).toBe('tts');
      expect(result.usedFallbackTts).toBe(true);
      expect(result.reason).toContain('已改用系统语音');
    } finally {
      FakeAudio.prototype.play = original;
    }
  });

  it('applies slow playback rate to recorded audio too', async () => {
    await service.speak('abandon', {
      accent: 'US',
      speed: 'slow',
      word: word({ audioUS: 'https://example.com/a.mp3' }),
    });
    expect(FakeAudio.instances.at(-1)?.playbackRate).toBe(0.75);
  });

  it('skips recorded audio when the learner turns that preference off', async () => {
    const result = await service.speak('abandon', {
      accent: 'US',
      speed: 'normal',
      preferRecordedAudio: false,
      word: word({ audioUS: 'https://example.com/a.mp3' }),
    });
    expect(result.source).toBe('tts');
    expect(FakeAudio.instances).toHaveLength(0);
  });
});

describe('BrowserPronunciationService — environment reporting', () => {
  it('describes an empty voice list honestly', async () => {
    installFakeEnvironment();
    const service = new BrowserPronunciationService();
    const env = service.describeEnvironment();
    expect(env.speechSupported).toBe(true);
    expect(env.voicesLoaded).toBe(false);
    expect(env.voiceCount).toBe(0);
    expect(env.usCount).toBe(0);
  });

  it('counts voices per accent once loaded', async () => {
    const synth = installFakeEnvironment();
    synth.voices = [US_VOICE, UK_VOICE];
    const service = new BrowserPronunciationService();
    const env = service.describeEnvironment();
    expect(env.voicesLoaded).toBe(true);
    expect(env.usCount).toBe(1);
    expect(env.ukCount).toBe(1);
  });
});

describe('phonetic + audio helpers', () => {
  it('returns the phonetic for the requested accent, then the legacy field', () => {
    const full = word({ phoneticUS: '/us/', phoneticUK: '/uk/', phonetic: '/legacy/' });
    expect(bestPhonetic(full, 'US')).toBe('/us/');
    expect(bestPhonetic(full, 'UK')).toBe('/uk/');
    expect(bestPhonetic(word({ phoneticUS: '', phoneticUK: '', phonetic: '/legacy/' }), 'US')).toBe('/legacy/');
  });

  it('reports whether a recorded audio URL exists for an accent', () => {
    expect(hasRecordedAudio(word({ audioUS: 'https://x/a.mp3' }), 'US')).toBe(true);
    expect(hasRecordedAudio(word({ audioUS: 'https://x/a.mp3' }), 'UK')).toBe(false);
  });
});
