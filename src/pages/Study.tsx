import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, RotateCcw, Zap } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { useStudySession } from '@/hooks/useStudySession';
import { usePronunciation } from '@/hooks/usePronunciation';
import { useApp } from '@/providers/appContext';
import { ErrorState, InfoBanner, ProgressBar, Spinner } from '@/components/ui';
import { StudyCard } from '@/components/StudyCard';
import { StudySetup } from '@/components/StudySetup';
import { startSession, type StartMode } from '@/lib/study/sessionRunner';
import type { WordOrder } from '@/lib/study/ordering';
import { formatDueLabel, toDateKey } from '@/lib/time';
import type { ReviewMode, Word } from '@/lib/types';

const MODE_LABEL: Record<ReviewMode, string> = {
  'en-zh': '英 → 中',
  'zh-en': '中 → 英',
  spelling: '拼写',
  choice: '选择',
};

export default function Study() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { settings, pushToast } = useApp();
  const {
    speak,
    speaking,
    supported,
    last: lastSpeak,
    error: speakError,
  } = usePronunciation();
  const {
    session,
    phase,
    word,
    progress,
    revealed,
    setRevealed,
    rate,
    pause,
    error,
    submitting,
    summary,
    starred,
    toggleStar,
    lastOutcome,
  } = useStudySession({ sessionId });
  const [pausedScreen, setPausedScreen] = useState(false);
  const [booting, setBooting] = useState(false);

  const pool = useLiveQuery(async () => {
    if (!session) return [] as Word[];
    if (session.reviewMode !== 'choice') return [] as Word[];
    const links = await db.deckWords.toArray();
    const allowed = new Set(
      session.deckIds.length === 0
        ? links.map((link) => link.wordId)
        : links.filter((link) => session.deckIds.includes(link.deckId)).map((link) => link.wordId),
    );
    const words = await db.words.toArray();
    return words.filter((item) => allowed.has(item.id));
  }, [session?.id, session?.reviewMode, session?.deckIds]);

  const distractorPool = useMemo(() => pool ?? [], [pool]);

  const startFresh = async (options?: {
    mode: StartMode;
    reviewMode: ReviewMode;
    timeBudgetMinutes: number;
    deckIds: string[];
    wordOrder: WordOrder;
  }) => {
    setBooting(true);
    try {
      const result = await startSession({
        mode: options?.mode ?? 'mixed',
        deckIds: options?.deckIds ?? settings.selectedDeckIds,
        settings: options ? { ...settings, timeBudgetMinutes: options.timeBudgetMinutes } : settings,
        now: Date.now(),
        reviewMode: options?.reviewMode ?? settings.reviewMode,
        timeBudgetMinutes: options?.timeBudgetMinutes ?? settings.timeBudgetMinutes,
        wordOrder: options?.wordOrder ?? settings.wordOrder,
      });
      if (!result.session) {
        pushToast({
          kind: 'info',
          title: '当前没有可学内容',
          description:
            result.reason === 'no-words'
              ? '当前词书没有单词，请先到「词书」页选择或导入。'
              : result.reason === 'no-new'
                ? '该词书的新词已经学完了。'
                : '到期复习已完成，且今日新词已达上限。',
        });
        return;
      }
      navigate(`/study/${result.session.id}`, { replace: true });
    } catch (err) {
      pushToast({ kind: 'error', title: '无法开始学习', description: (err as Error).message });
    } finally {
      setBooting(false);
    }
  };

  // Auto-play the word audio when the setting is on and a new card appears.
  const autoSpokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!word || !session) return;
    if (!settings.autoPlayAudio || !settings.soundEnabled) return;
    const key = `${session.cursor}:${word.id}`;
    if (autoSpokenFor.current === key) return;
    autoSpokenFor.current = key;
    void speak(word);
  }, [session, settings.autoPlayAudio, settings.soundEnabled, speak, word]);

  // Keyboard loop: space/enter reveal, 1/2/3 rate, S speaks.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (phase !== 'ready' || !session || pausedScreen) return;
      if (event.key === ' ' || event.key === 'Enter') {
        if (!revealed) {
          event.preventDefault();
          setRevealed(true);
        }
        return;
      }
      if (event.key.toLowerCase() === 's') {
        if (word) {
          event.preventDefault();
          void speak(word.term);
        }
        return;
      }
      if (revealed && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        const map = { '1': 'known', '2': 'fuzzy', '3': 'forgot' } as const;
        void rate(map[event.key as '1' | '2' | '3']);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [pausedScreen, phase, rate, revealed, session, setRevealed, speak, word]);

  const onPause = async () => {
    await pause();
    setPausedScreen(true);
  };

  if (booting) return <Spinner label="正在准备学习卡片…" />;

  // No session id in the URL → the setup screen (mode, budget, decks).
  if (!sessionId) {
    return <StudySetup starting={booting} onStart={(options) => startFresh(options)} />;
  }

  if (phase === 'loading') return <Spinner label="正在准备学习卡片…" />;
  if (phase === 'error') {
    return (
      <ErrorState
        message={error ?? '会话中的单词已被删除或数据不完整，请回到首页开始新的会话。'}
        onRetry={() => navigate('/')}
      />
    );
  }

  if (phase === 'idle') {
    return (
      <div className="card card-pad mx-auto max-w-lg text-center">
        <h1 className="text-xl font-semibold">这个会话不存在</h1>
        <p className="mt-1 text-sm text-muted">可能已被清理，重新开始一节即可。</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link to="/study" className="btn-primary">
            选择学习计划
          </Link>
          <Link to="/" className="btn-secondary">
            回到首页
          </Link>
        </div>
      </div>
    );
  }

  if (summary || phase === 'empty') {
    return (
      <SessionSummary
        session={session}
        summary={summary}
        onRestart={() => navigate('/study', { replace: true })}
      />
    );
  }

  if (!word || !session) return <Spinner />;

  if (pausedScreen) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card card-pad text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand">
            <RotateCcw className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="mt-3 text-xl font-semibold">已暂停</h1>
          <p className="mt-1 text-sm text-muted">
            已提交的反馈都已保存。你可以关闭页面，稍后从首页或「开始学习」页继续这节会话。
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" className="btn-primary" onClick={() => setPausedScreen(false)}>
              继续学习
            </button>
            <Link to="/" className="btn-secondary">
              返回首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isNewCard = session.cursor < session.plannedReviewCount;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void onPause()}
          className="btn-ghost !px-2.5"
          aria-label="暂停并返回"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">暂停</span>
        </button>
        <div className="min-w-0 flex-1">
          <ProgressBar
            value={progress?.done ?? 0}
            max={Math.max(1, progress?.total ?? 1)}
            label={`${progress?.done ?? 0} / ${progress?.total ?? 0} 张`}
          />
        </div>
        <span className="chip shrink-0">{MODE_LABEL[session.reviewMode] ?? session.reviewMode}</span>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${isNewCard ? 'bg-brand' : 'bg-accent'}`} aria-hidden />
          {isNewCard ? '新词阶段' : '复习阶段'} · 计划 {session.plannedReviewCount} 复习 +{' '}
          {session.plannedNewCount} 新词
        </span>
        {progress && progress.replaysPending > 0 ? (
          <span className="text-warn">还有 {progress.replaysPending} 个没记牢的词会稍后重现</span>
        ) : null}
      </div>

      <StudyCard
        key={`${session.cursor}-${word.id}`}
        word={word}
        reviewMode={session.reviewMode}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
        onRate={(rating) => void rate(rating)}
        onSpeak={() => void speak(word)}
        onSpeakSlow={() => void speak(word, { speed: 'slow' })}
        speaking={speaking}
        speechSupported={supported}
        accentLabel={settings.preferredAccent}
        accent={settings.preferredAccent}
        playbackNote={
          lastSpeak
            ? `${
                lastSpeak.source === 'recorded'
                  ? '录音'
                  : lastSpeak.source === 'online'
                    ? '联网音频'
                    : lastSpeak.source === 'synth'
                      ? '内置合成'
                      : '系统语音'
              }${lastSpeak.voiceName ? ` · ${lastSpeak.voiceName}` : ''}`
            : null
        }
        playbackError={speakError}
        disabled={submitting}
        starred={starred}
        onToggleStar={() => void toggleStar()}
        distractorPool={distractorPool}
        modeLabel={
          session.mode === 'mistakes'
            ? '错词强化'
            : session.mode === 'review'
              ? '到期复习'
              : session.mode === 'new'
                ? '新词学习'
                : undefined
        }
      />

      {lastOutcome ? (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="chip">
            {lastOutcome.term} ·{' '}
            {lastOutcome.rating === 'known' ? '认识' : lastOutcome.rating === 'fuzzy' ? '模糊' : '忘记'}
          </span>
          <span className="text-muted">
            → 下次复习 {formatDueLabel(lastOutcome.nextReviewAt, Date.now())}（{lastOutcome.state}）
          </span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <span>
          本节：认识 {session.correctCount} · 模糊 {session.fuzzyCount} · 忘记 {session.forgotCount}
        </span>
        <span className="tabular-nums">{progress?.percent ?? 0}% 已完成</span>
      </div>

      <div className="mt-4">
        <InfoBanner tone="info">
          每张卡的反馈会立即写入 IndexedDB 并重算下次复习时间，刷新页面不会丢失。
        </InfoBanner>
      </div>
    </div>
  );
}

function SessionSummary({
  session,
  summary,
  onRestart,
}: {
  session: import('@/lib/types').StudySession | null;
  summary: { xp: number; minutes: number; correct: number; total: number } | null;
  onRestart: () => void;
}) {
  const [stats, setStats] = useState<{ xp: number; today: number } | null>(null);
  const todayKey = toDateKey(Date.now());
  const dailyRow = useLiveQuery(() => db.dailyStats.get(todayKey), [todayKey]);

  useEffect(() => {
    void (async () => {
      const rows = await db.dailyStats.toArray();
      setStats({
        xp: rows.reduce((sum, r) => sum + r.xpEarned, 0),
        today: rows.find((r) => r.dateKey === todayKey)?.studiedCount ?? 0,
      });
    })();
  }, [todayKey]);

  return (
    <div className="mx-auto max-w-xl">
      <div className="card card-pad text-center">
        <div className="mx-auto grid h-14 w-14 animate-pop place-items-center rounded-2xl bg-ok/15 text-ok">
          <Check className="h-7 w-7" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">本节完成</h1>
        <p className="mt-1 text-sm text-muted">
          真实记录已保存。奖励来自实际反馈，刷新页面不会重复领取。
        </p>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] text-muted">卡片数</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{session?.sequence.length ?? 0}</dd>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] text-muted">认识</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">{session?.correctCount ?? 0}</dd>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] text-muted">模糊 / 忘记</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums">
              {session?.fuzzyCount ?? 0} / {session?.forgotCount ?? 0}
            </dd>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-[11px] text-muted">今日经验</dt>
            <dd className="mt-0.5 flex items-center justify-center gap-1 text-lg font-semibold tabular-nums text-brand">
              <Zap className="h-4 w-4" aria-hidden />
              {dailyRow?.xpEarned ?? summary?.xp ?? 0}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-muted">
          今日累计学习 {stats?.today ?? dailyRow?.studiedCount ?? 0} 词 · 本节用时约{' '}
          {Math.max(1, summary?.minutes ?? 0)} 分钟 · 累计经验 {stats?.xp ?? 0}
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" className="btn-primary" onClick={onRestart}>
            再学一节
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <Link to="/stats" className="btn-secondary">
            查看统计
          </Link>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Link to="/mistakes" className="card card-pad transition hover:border-brand/40">
          <p className="text-sm font-semibold">去错词本巩固</p>
          <p className="mt-0.5 text-xs text-muted">忘记或连续模糊的词会自动加入。</p>
        </Link>
        <Link to="/review" className="card card-pad transition hover:border-brand/40">
          <p className="text-sm font-semibold">查看下次复习</p>
          <p className="mt-0.5 text-xs text-muted">按算法排好的到期队列。</p>
        </Link>
      </div>
    </div>
  );
}
