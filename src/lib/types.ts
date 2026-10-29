/** Shared domain types for WordFlow. */

export type ExamType =
  | 'CET4'
  | 'CET6'
  | 'KAOYAN'
  | 'GAOKAO'
  | 'JUNIOR'
  | 'IELTS'
  | 'TOEFL'
  | 'GRE'
  | 'BUSINESS'
  | 'DAILY'
  | 'TECH'
  | 'custom';
export type MemoryState = 'new' | 'learning' | 'review' | 'relearning';
export type Rating = 'known' | 'fuzzy' | 'forgot';
export type ReviewMode = 'en-zh' | 'zh-en' | 'spelling' | 'choice';
export type Accent = 'US' | 'UK';
export type AudioSpeed = 'normal' | 'slow';

export interface WordExample {
  en: string;
  zh: string;
  /** Where the sentence came from, e.g. 'wordflow-demo' or an imported licence. */
  source?: string;
}

export interface WordTranslations {
  /** Per-definition Chinese translation, kept aligned with `definitions` by index. */
  zh: string[];
}

export interface Word {
  id: string;
  term: string;
  normalizedTerm: string;
  /**
   * Legacy single phonetic kept for older imports and backups.
   * New code reads `phoneticUS` / `phoneticUK` and falls back to this.
   */
  phonetic: string;
  phoneticUS: string;
  phoneticUK: string;
  partOfSpeech: string;
  definitions: string[];
  examples: WordExample[];
  /** Chinese translation of each definition (optional; `definitions` is usually already Chinese). */
  translations: string[];
  /**
   * Verified audio URLs. `null` means "no audio supplied" — the UI must fall
   * back to speech synthesis and never invent a URL.
   */
  audioUS: string | null;
  audioUK: string | null;
  tags: string[];
  source: string;
  licenseNote: string;
  /** Optional hand-written memory hook. `null` means "not available yet". */
  mnemonic: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Deck {
  id: string;
  name: string;
  examType: ExamType;
  description: string;
  source: string;
  licenseNote: string;
  /** Built-in hand-written sample deck — never presented as an official word list. */
  isDemo?: boolean;
  /** Version/date of the underlying glossary, e.g. '2026.10 (demo)'. */
  dataVersion?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeckWord {
  id: string;
  deckId: string;
  wordId: string;
  createdAt: number;
}

export interface UserWordState {
  id: string;
  wordId: string;
  deckId: string | null;
  state: MemoryState;
  difficulty: number;
  stability: number;
  /** Planned interval in days; fractional values are used for same-day steps. */
  scheduledDays: number;
  lastReviewedAt: number | null;
  nextReviewAt: number | null;
  repetitionCount: number;
  lapseCount: number;
  correctCount: number;
  /** Predicted probability of recall at `lastReviewedAt`. */
  estimatedRecall: number;
  /** Consecutive "fuzzy" ratings, used for the automatic mistake-book rule. */
  fuzzyStreak: number;
  isStarred: boolean;
  isInErrorBook: boolean;
  algorithmVersion: string;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLog {
  id: string;
  /**
   * Idempotency key generated once per card presentation. Re-submitting the same
   * answer (double click, retry) is ignored instead of inflating stats or XP.
   */
  eventId: string;
  wordId: string;
  sessionId: string;
  rating: Rating;
  reviewMode: ReviewMode;
  reviewedAt: number;
  /** Local date key (YYYY-MM-DD) for the moment of review. */
  dateKey: string;
  elapsedMs: number;
  scheduledDaysBefore: number;
  scheduledDaysAfter: number;
  stateBefore: MemoryState;
  stateAfter: MemoryState;
  wasCorrect: boolean;
  algorithmVersion: string;
}

export interface SessionPlanItem {
  wordId: string;
  kind: 'review' | 'new';
  dueAt: number | null;
}

export interface ShortQueueEntry {
  wordId: string;
  /** Cursor value after which the word should be shown again. */
  dueAfter: number;
}

export type SessionStatus = 'active' | 'paused' | 'completed';

export interface StudySession {
  id: string;
  startedAt: number;
  endedAt: number | null;
  status: SessionStatus;
  mode: 'mixed' | 'new' | 'review' | 'mistakes';
  reviewMode: ReviewMode;
  deckIds: string[];
  plannedNewCount: number;
  plannedReviewCount: number;
  plan: SessionPlanItem[];
  sequence: string[];
  /** Index of the next card in the main queue. */
  mainIndex: number;
  /** Total cards presented (main + replays); also the idempotency counter. */
  cursor: number;
  shortQueue: ShortQueueEntry[];
  completedWordIds: string[];
  newWordsCount: number;
  reviewedWordsCount: number;
  correctCount: number;
  fuzzyCount: number;
  forgotCount: number;
  durationSeconds: number;
  updatedAt: number;
}

export interface DailyStats {
  dateKey: string;
  studiedCount: number;
  reviewedCount: number;
  newCount: number;
  correctCount: number;
  fuzzyCount: number;
  forgotCount: number;
  durationSeconds: number;
  goalCompleted: boolean;
  xpEarned: number;
  updatedAt: number;
}

export interface AchievementRecord {
  id: string;
  code: string;
  name: string;
  description: string;
  unlockedAt: number | null;
  progress: number;
}

export interface ImportBatch {
  id: string;
  deckId: string;
  createdAt: number;
  wordIds: string[];
  fileName: string;
  createdWordIds: string[];
  createdDeckWordIds: string[];
}

export interface AlgorithmConfig {
  version: string;
  /** FSRS-style weights (public defaults, tuned copy lives in one place). */
  weights: number[];
  desiredRetention: number;
  maximumIntervalDays: number;
  learningAgainMinutes: number;
  learningFuzzyMinutes: number;
  relearningAgainMinutes: number;
  relearningFuzzyMinutes: number;
  graduationMinIntervalDays: number;
  maxConsecutiveReviews: number;
}

export interface AppSettings {
  dailyNewLimit: number;
  dailyReviewLimit: number;
  dailyGoalMinutes: number;
  dailyGoalCount: number;
  theme: 'light' | 'dark' | 'system';
  accentColor: 'indigo' | 'teal' | 'amber';
  preferredAccent: Accent;
  soundEnabled: boolean;
  /** Defaults to off: audio must never surprise the learner on card change. */
  autoPlayAudio: boolean;
  audioSpeed: AudioSpeed;
  /** Prefer stored audio files over speech synthesis when both exist. */
  preferRecordedAudio: boolean;
  /** Card ordering for new words / review queue. */
  wordOrder: 'alphabetical' | 'random' | 'frequency' | 'mistakes';
  /** Use online dictionary audio (real recordings) before system speech. */
  useOnlineAudio: boolean;
  reviewMode: ReviewMode;
  timeBudgetMinutes: number;
  /** Decks the learner is currently studying; empty means "all decks". */
  selectedDeckIds: string[];
  algorithmConfig: AlgorithmConfig;
  schemaVersion: number;
}

/** A deck category shown in the deck centre even when it has no data yet. */
export interface DeckCatalogEntry {
  key: ExamType;
  name: string;
  description: string;
  /** Where a licensed pack for this category would come from. Never invented. */
  suggestedSource: string;
  /** Deck ids that currently provide words for this category. */
  deckIds: string[];
}

export interface AiExamplePayload {
  wordId: string;
  sentence: string;
  sentenceZh: string;
  mnemonic: string;
  generatedAt: number;
  provider: string;
}
