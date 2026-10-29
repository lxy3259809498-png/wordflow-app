import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Keyboard,
  ListChecks,
  MousePointerClick,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Timer,
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { useApp } from '@/providers/appContext';
import { NO_DECK_SENTINEL } from '@/lib/settings/settings';
import { examLabel } from '@/lib/decks/labels';
import { previewStudyPlan, type StartMode } from '@/lib/study/sessionRunner';
import { findResumableSession } from '@/lib/study/sessionRunner';
import { ORDER_LABELS, type WordOrder } from '@/lib/study/ordering';
import { InfoBanner, Spinner } from '@/components/ui';
import type { ReviewMode, StudySession } from '@/lib/types';

const PRACTICE_MODES: {
  value: ReviewMode;
  title: string;
  hint: string;
  icon: typeof Keyboard;
}[] = [
  { value: 'en-zh', title: '英译中', hint: '看英文，回忆中文释义', icon: ListChecks },
  { value: 'zh-en', title: '中译英', hint: '看中文，回忆英文单词', icon: RotateCcw },
  { value: 'spelling', title: '纯拼写', hint: '看中文，逐字母拼出单词', icon: Keyboard },
  { value: 'choice', title: '选择题', hint: '看英文，从 4 个释义中选择', icon: MousePointerClick },
];

const CONTENT_MODES: { value: StartMode; title: string; hint: string }[] = [
  { value: 'mixed', title: '复习 + 新词', hint: '先清到期复习，再学新词（推荐）' },
  { value: 'review', title: '只复习', hint: '只做到期卡片' },
  { value: 'new', title: '只学新词', hint: '只推进新词，不安排复习' },
];

const BUDGETS = [5, 10, 15, 30];

export interface StudySetupProps {
  onStart: (options: {
    mode: StartMode;
    reviewMode: ReviewMode;
    timeBudgetMinutes: number;
    deckIds: string[];
    wordOrder: WordOrder;
  }) => Promise<void>;
  starting: boolean;
}

export function StudySetup({ onStart, starting }: StudySetupProps) {
  const { settings, updateSettings } = useApp();
  const snapshot = useLiveQuery(async () => {
    const [decks, deckWords, words, states] = await Promise.all([
      db.decks.toArray(),
      db.deckWords.toArray(),
      db.words.toArray(),
      db.userWordStates.toArray(),
    ]);
    return { decks, deckWords, words, states };
  }, []);

  const [reviewMode, setReviewMode] = useState<ReviewMode>(settings.reviewMode);
  const [contentMode, setContentMode] = useState<StartMode>('mixed');
  const [budget, setBudget] = useState<number>(settings.timeBudgetMinutes);
  const [wordOrder, setWordOrder] = useState<WordOrder>(settings.wordOrder);
  const [deckIds, setDeckIds] = useState<string[]>(settings.selectedDeckIds);
  const [deckQuery, setDeckQuery] = useState('');
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof previewStudyPlan>> | null>(null);
  const [resumable, setResumable] = useState<StudySession | undefined>();
  const [loadingPreview, setLoadingPreview] = useState(true);

  const deckOptions = useMemo(() => snapshot?.decks ?? [], [snapshot]);

  /** Per-deck learned/total, so the picker shows real progress, not a guess. */
  const deckStats = useMemo(() => {
    const map = new Map<string, { total: number; learned: number }>();
    if (!snapshot) return map;
    const studied = new Set(
      snapshot.states.filter((s) => s.lastReviewedAt !== null).map((s) => s.wordId),
    );
    for (const deck of snapshot.decks) {
      const ids = new Set(
        snapshot.deckWords.filter((link) => link.deckId === deck.id).map((link) => link.wordId),
      );
      let learned = 0;
      for (const id of ids) if (studied.has(id)) learned += 1;
      map.set(deck.id, { total: ids.size, learned });
    }
    return map;
  }, [snapshot]);

  const filteredDecks = useMemo(() => {
    const q = deckQuery.trim().toLowerCase();
    if (!q) return deckOptions;
    return deckOptions.filter(
      (deck) =>
        deck.name.toLowerCase().includes(q) ||
        examLabel(deck.examType).toLowerCase().includes(q) ||
        deck.examType.toLowerCase().includes(q),
    );
  }, [deckOptions, deckQuery]);

  useEffect(() => {
    void findResumableSession(Date.now()).then(setResumable);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingPreview(true);
    const timer = window.setTimeout(() => {
      void previewStudyPlan({
        mode: contentMode,
        deckIds,
        settings: { ...settings, timeBudgetMinutes: budget },
        now: Date.now(),
        timeBudgetMinutes: budget,
        wordOrder,
      })
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .finally(() => {
          if (!cancelled) setLoadingPreview(false);
        });
    }, 80);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [budget, contentMode, deckIds, settings, wordOrder]);

  const toggleDeck = (id: string) => {
    setDeckIds((current) => {
      // Drop the "no deck" sentinel as soon as a real deck is picked.
      const base = current.filter((item) => item !== NO_DECK_SENTINEL);
      const next = base.includes(id) ? base.filter((item) => item !== id) : [...base, id];
      updateSettings({ selectedDeckIds: next });
      return next;
    });
  };

  const handleStart = () => {
    const selected = deckIds.filter((id) => id !== NO_DECK_SENTINEL);
    updateSettings({
      reviewMode,
      timeBudgetMinutes: budget,
      selectedDeckIds: selected,
      wordOrder,
    });
    void onStart({
      mode: contentMode,
      reviewMode,
      timeBudgetMinutes: budget,
      deckIds: selected,
      wordOrder,
    });
  };

  if (!snapshot) return <Spinner label="正在读取词书…" />;

  const activeDeckIds = deckIds.filter((id) => id !== NO_DECK_SENTINEL);
  const totalWords =
    activeDeckIds.length === 0
      ? deckIds.length === 0
        ? snapshot.words.length
        : 0
      : snapshot.words.filter((word) =>
          snapshot.deckWords.some(
            (link) => link.wordId === word.id && activeDeckIds.includes(link.deckId),
          ),
        ).length;

  const canStart =
    Boolean(preview && preview.plannedNew + preview.plannedReview > 0) && !starting;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">开始学习</h1>
        <p className="mt-1 text-sm text-muted">
          选好练习方式和词书，系统会先排到期复习，再按时间预算补新词。
        </p>
      </div>

      {resumable ? (
        <div className="card card-pad flex flex-col gap-3 border-brand/40 bg-brand-soft/40 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">有一节未完成的会话</p>
            <p className="text-sm text-muted">
              已学 {resumable.completedWordIds.length} / {resumable.sequence.length} 词 ·{' '}
              {new Date(resumable.updatedAt).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              })}{' '}
              更新
            </p>
          </div>
          <Link to={`/study/${resumable.id}`} className="btn-primary shrink-0">
            继续上次
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : null}

      <section className="card card-pad space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">练习方式</h2>
          <span className="text-xs text-muted">决定这一节怎么考你</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {PRACTICE_MODES.map((mode) => {
            const active = reviewMode === mode.value;
            return (
              <button
                key={mode.value}
                type="button"
                onClick={() => setReviewMode(mode.value)}
                aria-pressed={active}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-brand bg-brand-soft/60'
                    : 'border-line bg-raised hover:border-brand/40 hover:bg-surface'
                }`}
              >
                <span
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    active ? 'bg-brand text-white' : 'bg-surface text-muted'
                  }`}
                >
                  <mode.icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    {mode.title}
                    {active ? <CheckCircle2 className="h-3.5 w-3.5 text-brand" aria-hidden /> : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{mode.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className="card card-pad space-y-3">
          <h2 className="section-title">本节内容</h2>
          <div className="space-y-2">
            {CONTENT_MODES.map((mode) => (
              <label
                key={mode.value}
                className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm transition ${
                  contentMode === mode.value
                    ? 'border-brand bg-brand-soft/40'
                    : 'border-line hover:bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name="content-mode"
                  className="mt-0.5 accent-[rgb(var(--brand))]"
                  checked={contentMode === mode.value}
                  onChange={() => setContentMode(mode.value)}
                />
                <span>
                  <span className="font-medium">{mode.title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{mode.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="card card-pad space-y-3">
          <h2 className="section-title flex items-center gap-1.5">
            <Timer className="h-4 w-4 text-brand" aria-hidden />
            时间预算
          </h2>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                onClick={() => setBudget(minutes)}
                aria-pressed={budget === minutes}
                className={`rounded-xl border px-3 py-1.5 text-sm font-medium transition ${
                  budget === minutes
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                {minutes} 分钟
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">
            按每张卡约 20 秒估算。预算用完时只保留复习，不再加新词。
          </p>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-muted">本节计划</p>
            {loadingPreview ? (
              <p className="mt-1 text-sm text-muted">计算中…</p>
            ) : preview && preview.plannedNew + preview.plannedReview > 0 ? (
              <>
                <p className="mt-1 text-lg font-semibold tabular-nums">
                  {preview.plannedReview} 复习 + {preview.plannedNew} 新词
                </p>
                <p className="text-xs text-muted">
                  约 {preview.estimatedMinutes} 分钟 · 到期 {preview.due} · 待学 {preview.fresh}
                </p>
                {preview.pressure ? (
                  <p className="mt-1 text-[11px] text-warn">
                    到期复习较多，本节已自动减少新词数量。
                  </p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-sm text-muted">
                {preview?.reason === 'no-words'
                  ? '当前词书没有单词。'
                  : contentMode === 'review'
                    ? '现在没有到期复习。'
                    : contentMode === 'new'
                      ? '该词书的新词已学完。'
                      : '暂时没有可学内容。'}
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="card card-pad space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">单词顺序</h2>
          <span className="text-xs text-muted">影响新词的出场顺序</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(ORDER_LABELS) as WordOrder[]).map((value) => {
            const active = wordOrder === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setWordOrder(value);
                  // Persist immediately so a reload keeps the learner's choice.
                  updateSettings({ wordOrder: value });
                }}
                aria-pressed={active}
                className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                  active ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-surface'
                }`}
              >
                <span
                  className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    active ? 'border-brand bg-brand' : 'border-line'
                  }`}
                  aria-hidden
                >
                  {active ? <CheckCircle2 className="h-3 w-3 text-white" /> : null}
                </span>
                <span>
                  <span className="text-sm font-medium">{ORDER_LABELS[value].label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{ORDER_LABELS[value].hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">
          乱序会在开始学习时固定下来：中途暂停再继续，顺序不变，也不会漏词或重复。
        </p>
      </section>

      <section className="card card-pad space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title flex items-center gap-1.5">
            <BookOpen className="h-4 w-4 text-brand" aria-hidden />
            选择词书
          </h2>
          <span className="text-xs text-muted" data-testid="deck-selection-summary">
            {deckIds.length === 0
              ? `全部词书 · ${totalWords} 词`
              : `已选 ${deckIds.length} 本 · ${totalWords} 词`}
          </span>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              className="input pl-9 !py-1.5 text-xs"
              placeholder="搜索词书名称或分类"
              value={deckQuery}
              onChange={(event) => setDeckQuery(event.target.value)}
              aria-label="搜索词书"
            />
          </label>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 !text-xs"
              onClick={() => {
                setDeckIds([]);
                updateSettings({ selectedDeckIds: [] });
              }}
              aria-pressed={deckIds.length === 0}
            >
              全选
            </button>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 !text-xs"
              onClick={() => {
                const allIds = deckOptions.map((deck) => deck.id);
                // Selecting every deck explicitly is different from "全部":
                // it also excludes decks created later.
                setDeckIds(allIds.length > 0 ? allIds : []);
                updateSettings({ selectedDeckIds: allIds });
              }}
              disabled={deckOptions.length === 0}
            >
              逐本选满
            </button>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 !text-xs"
              onClick={() => {
                // Empty selection means "no deck": keep the learner in control.
                setDeckIds([NO_DECK_SENTINEL]);
                updateSettings({ selectedDeckIds: [] });
              }}
              aria-pressed={deckIds.length > 0 && !deckOptions.some((d) => deckIds.includes(d.id))}
            >
              清空
            </button>
          </div>
        </div>

        <div className="grid max-h-72 gap-2 overflow-auto pr-1 sm:grid-cols-2">
          {deckOptions.length === 0 ? (
            <p className="text-sm text-muted">还没有词书，先到词书中心创建或导入。</p>
          ) : filteredDecks.length === 0 ? (
            <p className="text-sm text-muted">没有匹配的词书。</p>
          ) : (
            filteredDecks.map((deck) => {
              const active = deckIds.includes(deck.id);
              const stats = deckStats.get(deck.id);
              return (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => toggleDeck(deck.id)}
                  aria-pressed={active}
                  className={`flex items-start gap-2 rounded-xl border p-2.5 text-left transition ${
                    active ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-surface'
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border ${
                      active ? 'border-brand bg-brand text-white' : 'border-line'
                    }`}
                    aria-hidden
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{deck.name}</span>
                      <span className="chip shrink-0 text-[9px]">{examLabel(deck.examType)}</span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11px] text-muted">
                      <span className="font-medium text-ink" data-testid={`deck-total-${deck.id}`}>
                        共 {stats ? stats.total : 0} 词
                      </span>
                      {stats && stats.total > 0 ? (
                        <span>
                          · 已学 {stats.learned} · 待学 {stats.total - stats.learned}
                        </span>
                      ) : (
                        <span>· 尚未导入</span>
                      )}
                    </span>
                    {stats && stats.total > 0 ? (
                      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-line/70">
                        <span
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${Math.round((stats.learned / stats.total) * 100)}%` }}
                        />
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <p className="text-xs text-muted">
          {deckIds.length === 0
            ? '当前选择「全部」：包括以后新建的词书。'
            : deckIds.length > 0 && !deckOptions.some((d) => deckIds.includes(d.id))
              ? '当前没有选中任何词书，无法开始学习。'
              : `已选 ${deckIds.length} 本；新建的词书不会自动加入。`}
        </p>

        <Link to="/decks" className="text-xs text-brand hover:underline">
          管理词书与导入自己的词表 →
        </Link>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          练习方式与时间预算会记住，下次打开默认沿用。
        </p>
        <button type="button" className="btn-primary sm:min-w-44" onClick={handleStart} disabled={!canStart}>
          <Play className="h-4 w-4" aria-hidden />
          {starting ? '准备中…' : '开始学习'}
        </button>
      </div>

      {preview?.reason === 'no-words' ? (
        <InfoBanner tone="warn" title="当前词书没有单词">
          先到 <Link className="link" to="/decks">词书</Link> 页导入词表，或选择内置演示词书。
        </InfoBanner>
      ) : null}

      <InfoBanner tone="info">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          认识 / 模糊 / 忘记 会分别更新难度与稳定度；答错词本节稍后重现，跨天间隔由算法决定。
        </span>
      </InfoBanner>
    </div>
  );
}
