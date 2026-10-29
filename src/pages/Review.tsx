import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock3, Filter, PlayCircle, RotateCcw, Tag } from 'lucide-react';
import { EmptyState, PageHeader, ProgressBar, Spinner, StatCard, InfoBanner } from '@/components/ui';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useApp } from '@/providers/appContext';
import { isDue, isDueToday } from '@/lib/scheduler';
import { formatDueLabel, toDateKey } from '@/lib/time';
import { startSession } from '@/lib/study/sessionRunner';

type WindowFilter = 'now' | 'today' | 'week';

export default function Review() {
  const snapshot = useSnapshot();
  const { settings, pushToast } = useApp();
  const navigate = useNavigate();
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('now');
  const [deckFilter, setDeckFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const now = Date.now();

  const rows = useMemo(() => {
    if (!snapshot) return [];
    const stateByWord = new Map(snapshot.states.map((s) => [s.wordId, s]));
    const deckByWord = new Map(snapshot.deckWords.map((l) => [l.wordId, l.deckId]));
    const deckName = new Map(snapshot.decks.map((d) => [d.id, d.name]));
    return snapshot.words
      .map((word) => ({ word, state: stateByWord.get(word.id) }))
      .filter((row): row is { word: (typeof snapshot.words)[number]; state: NonNullable<typeof row.state> } =>
        Boolean(row.state?.nextReviewAt),
      )
      .map((row) => ({
        ...row,
        deckId: deckByWord.get(row.word.id) ?? 'none',
        deckName: deckName.get(deckByWord.get(row.word.id) ?? '') ?? '未归入词书',
      }))
      .filter((row) => {
        if (deckFilter !== 'all' && row.deckId !== deckFilter) return false;
        const due = row.state.nextReviewAt!;
        if (windowFilter === 'now') return isDue(row.state, now);
        if (windowFilter === 'today') return isDueToday(due, now);
        return due <= now + 7 * 86_400_000;
      })
      .sort((a, b) => (a.state.nextReviewAt ?? 0) - (b.state.nextReviewAt ?? 0));
  }, [snapshot, deckFilter, windowFilter, now]);

  const dueNow = useMemo(
    () => (snapshot ? snapshot.states.filter((s) => isDue(s, now)).length : 0),
    [snapshot, now],
  );

  const startReview = async () => {
    setBusy(true);
    try {
      const result = await startSession({
        mode: 'review',
        deckIds: deckFilter === 'all' ? settings.selectedDeckIds : [deckFilter],
        settings,
        now: Date.now(),
      });
      if (!result.session) {
        pushToast({ kind: 'info', title: '没有到期复习', description: '当前筛选条件下没有到期的单词。' });
        return;
      }
      navigate(`/study/${result.session.id}`);
    } catch (error) {
      pushToast({ kind: 'error', title: '无法开始复习', description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  if (!snapshot) return <Spinner label="正在计算复习队列…" />;

  const todayKey = toDateKey(now);
  const todayStats = snapshot.stats.find((s) => s.dateKey === todayKey);
  const tomorrowKey = toDateKey(now + 86_400_000);
  const tomorrow = snapshot.states.filter(
    (s) => s.nextReviewAt !== null && toDateKey(s.nextReviewAt) === tomorrowKey,
  ).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="复习队列"
        subtitle="按 nextReviewAt 与当前时间动态计算。到期复习优先，超过上限的部分顺延到下次。"
        actions={
          <button
            type="button"
            className="btn-primary"
            onClick={() => void startReview()}
            disabled={busy || dueNow === 0}
          >
            <PlayCircle className="h-4 w-4" aria-hidden />
            {dueNow === 0 ? '暂无到期' : `开始复习 ${Math.min(dueNow, settings.dailyReviewLimit)} 词`}
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="现在到期" value={dueNow} icon={<RotateCcw className="h-4 w-4" />} />
        <StatCard
          label="今日还到期"
          value={snapshot.states.filter((s) => s.nextReviewAt && isDueToday(s.nextReviewAt, now)).length}
          icon={<Clock3 className="h-4 w-4" />}
        />
        <StatCard label="明日计划" value={tomorrow} hint="跨天后才会转为到期" />
        <StatCard
          label="今日已复习"
          value={todayStats?.reviewedCount ?? 0}
          hint={`上限 ${settings.dailyReviewLimit} 词/天`}
        />
      </div>

      <div className="card card-pad space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Filter className="h-3.5 w-3.5" aria-hidden />
            时间范围
          </span>
          {(
            [
              ['now', '现在到期'],
              ['today', '今天内'],
              ['week', '未来 7 天'],
            ] as [WindowFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setWindowFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                windowFilter === value
                  ? 'bg-brand text-white'
                  : 'border border-line bg-surface text-muted hover:text-ink'
              }`}
              aria-pressed={windowFilter === value}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
            <Tag className="h-3.5 w-3.5" aria-hidden />
            词书
          </span>
          <select
            className="input !w-auto !py-1.5 text-xs"
            value={deckFilter}
            onChange={(event) => setDeckFilter(event.target.value)}
            aria-label="按词书筛选复习队列"
          >
            <option value="all">全部词书</option>
            {snapshot.decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-muted tabular-nums">{rows.length} 个匹配</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<RotateCcw className="h-5 w-5" />}
          title="当前筛选下没有复习任务"
          description={
            windowFilter === 'now'
              ? '很好，到期复习已经清空。可以切换到「今天内」看看稍后到期的词，或去学新词。'
              : '换个筛选条件，或先去背几个新词。'
          }
          action={
            <Link to="/study" className="btn-primary">
              去学新词
            </Link>
          }
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_0.8fr] gap-3 border-b border-line/70 px-5 py-2.5 sm:grid">
            <span className="table-head">单词</span>
            <span className="table-head">释义</span>
            <span className="table-head">下次复习</span>
            <span className="table-head text-right">状态</span>
          </div>
          <ul className="divide-y divide-line/70">
            {rows.slice(0, 100).map(({ word, state, deckName }) => (
              <li
                key={word.id}
                className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[1.4fr_1fr_1fr_0.8fr] sm:items-center sm:gap-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{word.term}</p>
                  <p className="truncate text-[11px] text-muted">{deckName}</p>
                </div>
                <p className="truncate text-sm text-muted">{word.definitions[0]}</p>
                <p className="text-xs text-muted">{formatDueLabel(state.nextReviewAt, now)}</p>
                <div className="flex items-center gap-2 sm:justify-end">
                  <span className="chip text-[10px]">{state.state}</span>
                  <div className="w-16">
                    <ProgressBar value={state.estimatedRecall * 100} max={100} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {rows.length > 100 ? (
            <p className="border-t border-line/70 px-5 py-2.5 text-xs text-muted">
              仅显示前 100 条，共 {rows.length} 条。
            </p>
          ) : null}
        </div>
      )}

      <InfoBanner tone="info">
        复习上限 {settings.dailyReviewLimit} 词/天、时间预算 {settings.timeBudgetMinutes} 分钟；在首页开始学习时会自动只安排能完成的数量。
      </InfoBanner>
    </div>
  );
}
