import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { commitReview } from '@/lib/data/repository';
import {
  advanceSession,
  finishSession,
  pickNextCard,
  sessionProgress,
} from '@/lib/study/session';
import type { Rating, StudySession } from '@/lib/types';
import { toDateKey } from '@/lib/time';
import { useApp } from '@/providers/appContext';

export type CardPhase = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

export interface LastOutcome {
  term: string;
  rating: Rating;
  nextReviewAt: number;
  scheduledDays: number;
  state: string;
}

export interface UseStudySessionOptions {
  sessionId?: string;
}

/**
 * Owns the whole study loop: resume, reveal, rate, short-queue replay and finish.
 * Every rating is persisted through `commitReview` before the UI advances, so a
 * refresh can never lose a submitted answer.
 */
export function useStudySession({ sessionId }: UseStudySessionOptions) {
  const { pushToast, settings } = useApp();
  const [session, setSession] = useState<StudySession | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{ xp: number; minutes: number; correct: number; total: number } | null>(
    null,
  );
  const [lastOutcome, setLastOutcome] = useState<LastOutcome | null>(null);
  const shownAt = useRef<number>(Date.now());
  const finishedRef = useRef(false);

  const words = useLiveQuery(() => db.words.toArray(), [], []);
  const wordsById = useMemo(() => new Map(words.map((w) => [w.id, w])), [words]);
  const nextWordId = session ? pickNextCard(session)?.wordId ?? null : null;
  const currentState = useLiveQuery(
    async () =>
      nextWordId ? await db.userWordStates.where('wordId').equals(nextWordId).first() : undefined,
    [nextWordId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const target = sessionId ? await db.sessions.get(sessionId) : undefined;
        if (!target) {
          if (!cancelled) setLoading(false);
          return;
        }
        if (!cancelled) {
          setSession(target);
          finishedRef.current = target.status === 'completed';
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    shownAt.current = Date.now();
    setRevealed(false);
  }, [session?.cursor, session?.shortQueue.length]);

  const next = session ? pickNextCard(session) : null;
  const word = next ? wordsById.get(next.wordId) : undefined;
  const progress = session ? sessionProgress(session) : undefined;

  const phase: CardPhase = loading
    ? 'loading'
    : error
      ? 'error'
      : !session
        ? 'idle'
        : next === null
          ? 'empty'
          : word
            ? 'ready'
            : 'error';

  const rate = useCallback(
    async (rating: Rating) => {
      if (!session || !word || submitting) return;
      const now = Date.now();
      const wasNew = !(await db.userWordStates.where('wordId').equals(word.id).first());
      const advanced = advanceSession(session, {
        rating,
        wasNew,
        source: next?.source ?? 'main',
        wordId: word.id,
        now,
      });
      const hasMore = pickNextCard(advanced) !== null;
      const finalSession = hasMore ? advanced : finishSession(advanced, now);
      const eventId = `${session.id}:${session.cursor}:${word.id}`;
      const xpBefore = (await db.dailyStats.get(toDateKey(now)))?.xpEarned ?? 0;

      setSubmitting(true);
      try {
        const result = await commitReview({
          session,
          word,
          rating,
          reviewMode: session.reviewMode,
          eventId,
          elapsedMs: now - shownAt.current,
          now,
          nextSession: finalSession,
          dailyGoalCount: settings.dailyGoalCount,
          dailyGoalMinutes: settings.dailyGoalMinutes,
        });
        setSession(finalSession);
        setLastOutcome({
          term: word.term,
          rating,
          nextReviewAt: result.state.nextReviewAt ?? now,
          scheduledDays: result.state.scheduledDays,
          state: result.state.state,
        });
        if (!hasMore) {
          finishedRef.current = true;
          const stats = await db.dailyStats.get(toDateKey(now));
          setSummary({
            xp: Math.max(0, (stats?.xpEarned ?? 0) - xpBefore) + (result.duplicate ? 0 : 0),
            minutes: Math.round(finalSession.durationSeconds / 60),
            correct: finalSession.correctCount,
            total: finalSession.sequence.length,
          });
        }
      } catch (err) {
        setError((err as Error).message);
        pushToast({ kind: 'error', title: '保存失败', description: (err as Error).message });
      } finally {
        setSubmitting(false);
      }
    },
    [next?.source, pushToast, session, settings.dailyGoalCount, settings.dailyGoalMinutes, submitting, word],
  );

  const pause = useCallback(async () => {
    if (!session) return;
    const paused: StudySession = { ...session, status: 'paused', updatedAt: Date.now() };
    await db.sessions.put(paused);
    setSession(paused);
  }, [session]);

  const toggleStar = useCallback(async () => {
    if (!word) return;
    const { setStarred } = await import('@/lib/data/repository');
    await setStarred(word.id, !(currentState?.isStarred ?? false), Date.now());
  }, [currentState?.isStarred, word]);

  return {
    session,
    phase,
    word,
    source: next?.source,
    progress,
    revealed,
    setRevealed,
    rate,
    pause,
    error,
    submitting,
    summary,
    starred: currentState?.isStarred ?? false,
    toggleStar,
    lastOutcome,
  };
}
