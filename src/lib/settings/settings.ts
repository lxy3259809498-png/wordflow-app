import { DEFAULT_ALGORITHM_CONFIG } from '@/lib/scheduler';
import type { AppSettings } from '@/lib/types';

export const SETTINGS_KEY = 'wordflow.settings.v1';
export const THEME_KEY = 'wordflow.theme';
export const SETTINGS_SCHEMA_VERSION = 1;

/**
 * Internal marker meaning "the learner deliberately deselected every deck".
 * It must never leak into queries (which would look for a non-existent deck id).
 */
export const NO_DECK_SENTINEL = '__none__';

export const DEFAULT_SETTINGS: AppSettings = {
  dailyNewLimit: 12,
  dailyReviewLimit: 80,
  dailyGoalMinutes: 15,
  dailyGoalCount: 20,
  theme: 'system',
  accentColor: 'indigo',
  preferredAccent: 'US',
  soundEnabled: true,
  autoPlayAudio: false,
  audioSpeed: 'normal',
  preferRecordedAudio: true,
  wordOrder: 'alphabetical',
  useOnlineAudio: true,
  reviewMode: 'en-zh',
  timeBudgetMinutes: 15,
  selectedDeckIds: [],
  algorithmConfig: DEFAULT_ALGORITHM_CONFIG,
  schemaVersion: SETTINGS_SCHEMA_VERSION,
};

const ACCENTS = new Set(['indigo', 'teal', 'amber']);
const THEMES = new Set(['light', 'dark', 'system']);
const MODES = new Set(['en-zh', 'zh-en', 'spelling', 'choice']);

const clampNumber = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Defensive parse: unknown/corrupt settings fall back to defaults field by field. */
export function normaliseSettings(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS };
  const input = raw as Partial<AppSettings>;
  const algorithm = input.algorithmConfig;
  return {
    dailyNewLimit: clampNumber(input.dailyNewLimit, 0, 100, DEFAULT_SETTINGS.dailyNewLimit),
    dailyReviewLimit: clampNumber(input.dailyReviewLimit, 0, 500, DEFAULT_SETTINGS.dailyReviewLimit),
    dailyGoalMinutes: clampNumber(input.dailyGoalMinutes, 0, 240, DEFAULT_SETTINGS.dailyGoalMinutes),
    dailyGoalCount: clampNumber(input.dailyGoalCount, 1, 200, DEFAULT_SETTINGS.dailyGoalCount),
    theme: THEMES.has(input.theme as string) ? (input.theme as AppSettings['theme']) : 'system',
    accentColor: ACCENTS.has(input.accentColor as string)
      ? (input.accentColor as AppSettings['accentColor'])
      : 'indigo',
    preferredAccent: input.preferredAccent === 'UK' ? 'UK' : 'US',
    soundEnabled: input.soundEnabled !== false,
    reviewMode: MODES.has(input.reviewMode as string)
      ? (input.reviewMode as AppSettings['reviewMode'])
      : 'en-zh',
    autoPlayAudio: input.autoPlayAudio === true,
    audioSpeed: input.audioSpeed === 'slow' ? 'slow' : 'normal',
    preferRecordedAudio: input.preferRecordedAudio !== false,
    wordOrder:
      input.wordOrder === 'random' ||
      input.wordOrder === 'frequency' ||
      input.wordOrder === 'mistakes'
        ? input.wordOrder
        : 'alphabetical',
    useOnlineAudio: input.useOnlineAudio !== false,
    timeBudgetMinutes: clampNumber(input.timeBudgetMinutes, 1, 240, DEFAULT_SETTINGS.timeBudgetMinutes),
    selectedDeckIds: Array.isArray(input.selectedDeckIds)
      ? input.selectedDeckIds.filter(
          (id): id is string => typeof id === 'string' && id.length > 0 && id !== NO_DECK_SENTINEL,
        )
      : [],
    algorithmConfig:
      algorithm && Array.isArray(algorithm.weights) && algorithm.weights.length >= 19
        ? {
            ...DEFAULT_ALGORITHM_CONFIG,
            ...algorithm,
            weights: algorithm.weights.map((w) =>
              typeof w === 'number' && Number.isFinite(w) ? w : 0,
            ),
            desiredRetention: Math.min(
              0.99,
              Math.max(0.7, Number(algorithm.desiredRetention) || 0.9),
            ),
          }
        : DEFAULT_ALGORITHM_CONFIG,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
  };
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return normaliseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  const normalised = normaliseSettings(settings);
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalised));
  localStorage.setItem(THEME_KEY, JSON.stringify({ mode: normalised.theme }));
  applyTheme(normalised.theme);
  applyAccent(normalised.accentColor);
}

export function prefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function resolveDark(mode: AppSettings['theme']): boolean {
  return mode === 'dark' || (mode === 'system' && prefersDark());
}

export function applyTheme(mode: AppSettings['theme']): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', resolveDark(mode));
}

const ACCENT_MAP: Record<AppSettings['accentColor'], string> = {
  indigo: '109 94 252',
  teal: '20 150 140',
  amber: '201 132 20',
};

export function applyAccent(accent: AppSettings['accentColor']): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--brand', ACCENT_MAP[accent] ?? ACCENT_MAP.indigo);
}
