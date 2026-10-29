import type { Accent, AudioSpeed, Word } from '@/lib/types';
import {
  isFallbackSynthSupported,
  primeAudioContext,
  speakWithFormantSynth,
} from '@/lib/audio/fallbackSynth';
import { resolveAudio, type ResolvedAudio } from '@/lib/audio/audioSource';

/**
 * Pronunciation service.
 *
 * Priority when speaking a word:
 *   1. a verified audio URL stored on the word (`audioUS` / `audioUK`),
 *   2. an online dictionary recording (real human audio, resolved per word),
 *   3. browser SpeechSynthesis (system voice),
 *   4. the built-in formant synthesiser, which still produces sound on machines
 *      that ship no English system voice (common on Windows/Android).
 *
 * Nothing here invents URLs: online audio is probed first, and a word with no
 * source simply falls through to the next mechanism.
 */

export type AudioSource = 'recorded' | 'online' | 'tts' | 'synth';

export interface SpeakResult {
  ok: boolean;
  /** Which mechanism produced the sound (undefined when nothing played). */
  source?: AudioSource;
  /** Voice actually used, for transparent UI + tests. */
  voiceName?: string;
  voiceLang?: string;
  /** True when the requested accent had no voice and another English voice was used. */
  usedFallbackVoice?: boolean;
  /** True when the word has no recorded audio and TTS was used instead. */
  usedFallbackTts?: boolean;
  /** True when neither audio nor a system voice worked and formant synth ran. */
  usedBuiltinSynth?: boolean;
  reason?: string;
  /** Machine-readable failure reason for the UI to branch on. */
  code?:
    | 'no-synthesis'
    | 'no-voices'
    | 'audio-error'
    | 'audio-timeout'
    | 'not-allowed'
    | 'empty-text'
    | 'aborted'
    | 'unknown';
}

export interface SpeakOptions {
  accent: Accent;
  speed: AudioSpeed;
  /** When false, skip recorded audio and go straight to TTS. */
  preferRecordedAudio?: boolean;
  /** When false, do not probe online dictionary audio. */
  useOnlineAudio?: boolean;
  word?: Pick<Word, 'term' | 'audioUS' | 'audioUK'>;
}

export interface PronunciationService {
  /** True when SpeechSynthesis exists in this environment. */
  isSpeechSupported(): boolean;
  /** Voices installed for an accent (may be empty until `voiceschanged`). */
  listVoices(accent: Accent): SpeechSynthesisVoice[];
  /** All English voices, ordered by preference (exact accent first). */
  listEnglishVoices(accent: Accent): SpeechSynthesisVoice[];
  /** Resolves once the browser has populated the voice list, or on timeout. */
  ensureVoices(timeoutMs?: number): Promise<SpeechSynthesisVoice[]>;
  speak(text: string, options: SpeakOptions): Promise<SpeakResult>;
  /** Explicitly stop whatever is playing (audio or speech). */
  stop(): void;
  /** Diagnostic snapshot for the pronunciation test page. */
  describeEnvironment(): {
    speechSupported: boolean;
    voicesLoaded: boolean;
    voiceCount: number;
    englishVoiceCount: number;
    usCount: number;
    ukCount: number;
    canPlayAudio: boolean;
  };
}

const isBrowser = (): boolean => typeof window !== 'undefined';
const synth = (): SpeechSynthesis | null =>
  isBrowser() && 'speechSynthesis' in window ? window.speechSynthesis : null;

const normalizeLang = (lang: string): string => lang.replace('_', '-').toLowerCase();
const isEnglish = (lang: string): boolean => normalizeLang(lang).startsWith('en');

function voiceMatchesAccent(voice: SpeechSynthesisVoice, accent: Accent): boolean {
  const lang = normalizeLang(voice.lang);
  return accent === 'UK' ? lang.startsWith('en-gb') : lang.startsWith('en-us');
}

/** Preferred voice names per platform, best first. Keeps quality predictable. */
const PREFERRED_VOICE_HINTS: Record<Accent, string[]> = {
  US: ['google us english', 'samantha', 'microsoft aria', 'microsoft zira', 'alex', 'daniel', 'google'],
  UK: ['google uk english female', 'google uk english male', 'kate', 'serena', 'daniel', 'microsoft hazel', 'google'],
};

function rankVoice(voice: SpeechSynthesisVoice, accent: Accent): number {
  const name = voice.name.toLowerCase();
  const hints = PREFERRED_VOICE_HINTS[accent];
  const hintIndex = hints.findIndex((hint) => name.includes(hint));
  let score = hintIndex === -1 ? 100 : hintIndex;
  if (voice.localService) score -= 0.5;
  if (voice.default) score -= 0.25;
  return score;
}

export class BrowserPronunciationService implements PronunciationService {
  private audio: HTMLAudioElement | null = null;
  private voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null;

  isSpeechSupported(): boolean {
    return synth() !== null && typeof window !== 'undefined' && 'SpeechSynthesisUtterance' in window;
  }

  listEnglishVoices(accent: Accent): SpeechSynthesisVoice[] {
    const s = synth();
    if (!s) return [];
    const all = s.getVoices().filter((voice) => isEnglish(voice.lang));
    const matching = all.filter((voice) => voiceMatchesAccent(voice, accent));
    const others = all.filter((voice) => !voiceMatchesAccent(voice, accent));
    return [...matching.sort((a, b) => rankVoice(a, accent) - rankVoice(b, accent)), ...others];
  }

  listVoices(accent: Accent): SpeechSynthesisVoice[] {
    const s = synth();
    if (!s) return [];
    return s.getVoices().filter((voice) => voiceMatchesAccent(voice, accent));
  }

  /**
   * Chrome returns an empty list until `voiceschanged` fires. Callers must not
   * conclude "no voices" before this resolves.
   */
  async ensureVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
    const s = synth();
    if (!s) return [];
    const existing = s.getVoices();
    if (existing.length > 0) return existing;
    if (this.voicesPromise) return this.voicesPromise;

    this.voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let settled = false;
      // Declared before `finish` would run (always async), so the const bindings
      // below are initialised by the time any callback fires.
      let cleanup: () => void = () => {};

      const finish = (voices: SpeechSynthesisVoice[]) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.voicesPromise = null;
        resolve(voices);
      };
      const onChange = () => {
        const voices = s.getVoices();
        if (voices.length > 0) finish(voices);
      };
      s.addEventListener('voiceschanged', onChange);

      // Some browsers never fire `voiceschanged`; poll gently as a backstop.
      const poll = window.setInterval(() => {
        const voices = s.getVoices();
        if (voices.length > 0) finish(voices);
      }, 150);
      const timer = window.setTimeout(() => finish(s.getVoices()), timeoutMs);
      cleanup = () => {
        window.clearTimeout(timer);
        window.clearInterval(poll);
        s.removeEventListener('voiceschanged', onChange);
      };
    });
    return this.voicesPromise;
  }

  stop(): void {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.removeAttribute('src');
        this.audio.load();
      } catch {
        // Element already torn down — nothing to do.
      }
      this.audio = null;
    }
    // Always cancel speech too: a previous request may still be talking even
    // when the current one is an audio file.
    const s = synth();
    if (s) s.cancel();
  }

  private pickVoice(accent: Accent): { voice: SpeechSynthesisVoice | null; fallback: boolean } {
    const candidates = this.listEnglishVoices(accent);
    const exact = candidates.find((voice) => voiceMatchesAccent(voice, accent));
    if (exact) return { voice: exact, fallback: false };
    return { voice: candidates[0] ?? null, fallback: Boolean(candidates[0]) };
  }

  private speakWithTts(
    text: string,
    accent: Accent,
    speed: AudioSpeed,
  ): Promise<SpeakResult> {
    const s = synth();
    if (!s || !this.isSpeechSupported()) {
      return Promise.resolve({
        ok: false,
        code: 'no-synthesis',
        reason: '当前浏览器不支持语音合成（SpeechSynthesis）。',
      });
    }
    const { voice, fallback } = this.pickVoice(accent);
    if (!voice) {
      return Promise.resolve({
        ok: false,
        code: 'no-voices',
        reason:
          '系统里没有可用的英语语音。可在 Windows「设置 → 时间和语言 → 语言」或 macOS「系统设置 → 辅助功能 → 朗读内容」中安装英语语音包后重试。',
      });
    }

    // Never stack utterances: cancel whatever is currently speaking.
    this.stop();

    return new Promise<SpeakResult>((resolve) => {
      let settled = false;
      let started = false;
      let cleanup: () => void = () => {};
      const finish = (result: SpeakResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = speed === 'slow' ? 0.55 : 0.95;
      utterance.pitch = 1;
      utterance.volume = 1;

      utterance.onstart = () => {
        // `onstart` is the only reliable proof that audio actually began.
        started = true;
      };
      utterance.onend = () =>
        finish({
          ok: true,
          source: 'tts',
          voiceName: voice.name,
          voiceLang: voice.lang,
          usedFallbackVoice: fallback,
        });
      utterance.onerror = (event) => {
        const error = (event as SpeechSynthesisErrorEvent).error;
        if (error === 'canceled' || error === 'interrupted') {
          finish({ ok: false, code: 'aborted', reason: '播放被新的发音请求打断。' });
          return;
        }
        finish({
          ok: false,
          code: error === 'not-allowed' ? 'not-allowed' : 'unknown',
          reason:
            error === 'not-allowed'
              ? '浏览器阻止了播放，请先在页面上点击一次再试。'
              : `语音播放失败：${error || 'unknown'}`,
        });
      };

      const timer = window.setTimeout(() => {
        if (started) {
          // Still speaking on a slow engine — don't report a false failure.
          finish({ ok: true, source: 'tts', voiceName: voice.name, voiceLang: voice.lang });
        } else {
          finish({
            ok: false,
            code: 'unknown',
            reason: '语音播放超时：没有检测到实际发声，请检查系统音量或语音包。',
          });
        }
      }, Math.max(6000, text.length * 220));
      cleanup = () => window.clearTimeout(timer);

      try {
        s.speak(utterance);
      } catch (error) {
        finish({ ok: false, code: 'unknown', reason: `语音播放失败：${(error as Error).message}` });
      }
    });
  }

  private playAudio(url: string, speed: AudioSpeed): Promise<SpeakResult> {
    if (!isBrowser() || typeof window.Audio === 'undefined') {
      return Promise.resolve({
        ok: false,
        code: 'audio-error',
        reason: '当前环境不支持音频播放。',
      });
    }
    const audio = new window.Audio();
    audio.preload = 'auto';
    // Deliberately NOT setting crossOrigin: the dictionary host sends no CORS
    // headers, and `<audio>` can still play a cross-origin URL. Requesting
    // anonymous CORS here would make an otherwise playable file fail.
    if (!/^https?:\/\/dict\.youdao\.com\//i.test(url)) {
      audio.crossOrigin = 'anonymous';
    }
    this.audio = audio;

    return new Promise<SpeakResult>((resolve) => {
      let settled = false;
      let started = false;
      const finish = (result: SpeakResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        audio.onerror = null;
        audio.onended = null;
        audio.onplaying = null;
        audio.onloadedmetadata = null;
        resolve(result);
      };

      const timer = window.setTimeout(
        () =>
          finish({
            ok: false,
            code: 'audio-timeout',
            reason: '音频加载超时（网络较慢或源站不可用）。',
          }),
        8000,
      );

      audio.onerror = () =>
        finish({
          ok: false,
          code: 'audio-error',
          reason: '音频加载失败（链接失效或网络错误）。',
        });
      // `onplaying` is the only reliable proof that sound actually started.
      audio.onplaying = () => {
        started = true;
      };
      audio.onended = () => {
        if (started) finish({ ok: true, source: 'recorded', voiceName: url });
        else finish({ ok: false, code: 'audio-error', reason: '音频没有实际播放。' });
      };
      audio.onloadedmetadata = () => {
        // Recorded files cannot be slowed via SpeechSynthesis; playbackRate is
        // applied for slow mode where the browser supports it.
        audio.playbackRate = speed === 'slow' ? 0.75 : 1;
      };

      audio.src = url;
      void audio
        .play()
        .then(() => {
          // Resolving does not guarantee audible output; `onplaying` does.
        })
        .catch((error: unknown) => {
          const name = (error as { name?: string }).name;
          finish({
            ok: false,
            code: name === 'NotAllowedError' ? 'not-allowed' : 'audio-error',
            reason:
              name === 'NotAllowedError'
                ? '浏览器阻止了播放，请先在页面上点击一次再试。'
                : `音频播放失败：${(error as Error).message || 'unknown'}`,
          });
        });
    });
  }

  async speak(text: string, options: SpeakOptions): Promise<SpeakResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, code: 'empty-text', reason: '没有可发音的文本。' };
    }

    // Unlock the shared AudioContext synchronously (still inside the click) so
    // the built-in synthesiser is not left in a silent `suspended` state after
    // the async work below.
    primeAudioContext();

    // Stop anything already playing so rapid clicks never overlap.
    this.stop();

    const { accent, speed, word } = options;
    const preferRecorded = options.preferRecordedAudio !== false;

    if (preferRecorded) {
      // Stored file → online dictionary recording, whichever exists first.
      const resolved: ResolvedAudio | null = word
        ? await resolveAudio(word, accent, {
            onlineEnabled: options.useOnlineAudio !== false,
          })
        : null;

      if (resolved) {
        const audioResult = await this.playAudio(resolved.url, speed);
        if (audioResult.ok) {
          return {
            ...audioResult,
            source: resolved.kind === 'online' ? 'online' : 'recorded',
            voiceName: resolved.provider,
            usedFallbackTts: false,
          };
        }
        const fallback = await this.speakWithTts(trimmed, accent, speed);
        if (fallback.ok) {
          return {
            ...fallback,
            usedFallbackTts: true,
            reason: `${audioResult.reason ?? '录音播放失败'}，已改用系统语音。`,
          };
        }
        return this.runBuiltinSynth(trimmed, speed, audioResult.reason ?? fallback.reason);
      }
    }

    // Make sure voices are loaded before deciding there are none.
    await this.ensureVoices();
    const result = await this.speakWithTts(trimmed, accent, speed);
    if (result.ok) return result;
    // No usable English voice on this machine → still make a sound.
    return this.runBuiltinSynth(trimmed, speed, result.reason);
  }

  /** Last-resort synthesis so "no English voice installed" is not silence. */
  private runBuiltinSynth(
    text: string,
    speed: AudioSpeed,
    previousReason?: string,
  ): SpeakResult {
    if (!isFallbackSynthSupported()) {
      return {
        ok: false,
        code: 'no-voices',
        reason: previousReason ?? '这台设备没有可用的英语语音，且浏览器不支持内置合成。',
      };
    }
    const synthResult = speakWithFormantSynth(text, {
      rate: speed === 'slow' ? 0.6 : 1,
      volume: 0.4,
    });
    if (!synthResult.ok) {
      return { ok: false, code: 'no-voices', reason: synthResult.reason ?? previousReason };
    }
    return {
      ok: true,
      source: 'synth',
      voiceName: 'WordFlow 内置合成',
      voiceLang: 'en',
      usedBuiltinSynth: true,
      usedFallbackTts: false,
      reason: previousReason
        ? `${previousReason} 已改用内置发音（音质不如系统语音）。`
        : undefined,
    };
  }

  describeEnvironment() {
    const s = synth();
    const voices = s ? s.getVoices() : [];
    return {
      speechSupported: this.isSpeechSupported(),
      voicesLoaded: voices.length > 0,
      voiceCount: voices.length,
      englishVoiceCount: voices.filter((voice) => isEnglish(voice.lang)).length,
      usCount: voices.filter((voice) => voiceMatchesAccent(voice, 'US')).length,
      ukCount: voices.filter((voice) => voiceMatchesAccent(voice, 'UK')).length,
      canPlayAudio: isBrowser() && typeof window.Audio !== 'undefined',
    };
  }
}

/** Singleton used by the app. Swap `setPronunciationService` in tests. */
let service: PronunciationService = new BrowserPronunciationService();

export const getPronunciationService = (): PronunciationService => service;
export const setPronunciationService = (next: PronunciationService): void => {
  service = next;
};

/** Convenience helpers shared by UI code. */
export function bestPhonetic(word: Pick<Word, 'phonetic' | 'phoneticUS' | 'phoneticUK'>, accent: Accent): string {
  return (accent === 'UK' ? word.phoneticUK : word.phoneticUS) || word.phonetic || '';
}

export function hasRecordedAudio(word: Pick<Word, 'audioUS' | 'audioUK'>, accent: Accent): boolean {
  return Boolean(accent === 'UK' ? word.audioUK : word.audioUS);
}
