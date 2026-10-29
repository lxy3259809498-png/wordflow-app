import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getPronunciationService,
  type SpeakResult,
} from '@/lib/audio/pronunciationService';
import { useApp } from '@/providers/appContext';
import type { Accent, AudioSpeed, Word } from '@/lib/types';

export interface PronunciationState {
  speaking: boolean;
  error: string | null;
  supported: boolean;
  voicesLoaded: boolean;
  usCount: number;
  ukCount: number;
  /** Last successful playback, for transparent UI ("正在用 XX 语音"). */
  last: SpeakResult | null;
}

const initialState = (): PronunciationState => {
  const service = getPronunciationService();
  const env = service.describeEnvironment();
  return {
    speaking: false,
    error: null,
    supported: env.speechSupported,
    voicesLoaded: env.voicesLoaded,
    usCount: env.usCount,
    ukCount: env.ukCount,
    last: null,
  };
};

/**
 * Shared pronunciation hook. Handles async voice loading, cancellation and
 * surfacing the *real* outcome (which mechanism played, or why nothing did).
 */
export function usePronunciation() {
  const { settings, pushToast } = useApp();
  const [state, setState] = useState<PronunciationState>(initialState);
  const mounted = useRef(true);
  const requestId = useRef(0);

  const refreshVoices = useCallback(() => {
    const env = getPronunciationService().describeEnvironment();
    setState((current) => ({
      ...current,
      supported: env.speechSupported,
      voicesLoaded: env.voicesLoaded,
      usCount: env.usCount,
      ukCount: env.ukCount,
    }));
  }, []);

  // Voices load asynchronously (Chrome starts empty) — wait, then re-check.
  useEffect(() => {
    mounted.current = true;
    const service = getPronunciationService();
    refreshVoices();
    void service.ensureVoices().then(() => {
      if (mounted.current) refreshVoices();
    });

    const s = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!s) return () => {
      mounted.current = false;
    };
    const handler = () => refreshVoices();
    s.addEventListener('voiceschanged', handler);
    return () => {
      mounted.current = false;
      s.removeEventListener('voiceschanged', handler);
    };
  }, [refreshVoices]);

  const speak = useCallback(
    async (word: Word | string, options?: { accent?: Accent; speed?: AudioSpeed }) => {
      if (!settings.soundEnabled) {
        setState((current) => ({
          ...current,
          error: '发音已在设置中关闭，可在「设置 → 外观与发音」打开。',
        }));
        return null;
      }

      const service = getPronunciationService();
      const accent = options?.accent ?? settings.preferredAccent;
      const speed = options?.speed ?? settings.audioSpeed;
      const text = typeof word === 'string' ? word : word.term;

      requestId.current += 1;
      const currentRequest = requestId.current;
      setState((current) => ({ ...current, speaking: true, error: null }));

      const result = await service.speak(text, {
        accent,
        speed,
        preferRecordedAudio: settings.preferRecordedAudio,
        useOnlineAudio: settings.useOnlineAudio,
        word: typeof word === 'string' ? undefined : word,
      });

      // Ignore results from a request that a newer click superseded.
      if (!mounted.current || currentRequest !== requestId.current) return result;

      setState((current) => ({
        ...current,
        speaking: false,
        error: result.ok ? null : (result.reason ?? '播放失败'),
        last: result.ok ? result : current.last,
      }));

      if (!result.ok && result.code !== 'aborted') {
        pushToast({ kind: 'error', title: '发音不可用', description: result.reason });
      }
      return result;
    },
    [
      pushToast,
      settings.audioSpeed,
      settings.preferRecordedAudio,
      settings.preferredAccent,
      settings.soundEnabled,
      settings.useOnlineAudio,
    ],
  );

  const stop = useCallback(() => {
    getPronunciationService().stop();
    setState((current) => ({ ...current, speaking: false }));
  }, []);

  return { ...state, speak, stop };
}
