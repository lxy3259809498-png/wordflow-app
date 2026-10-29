import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookX, History, PlayCircle, Star, StarOff, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db';
import { EmptyState, PageHeader, Spinner, InfoBanner, StatCard } from '@/components/ui';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useApp } from '@/providers/appContext';
import { setErrorBook, setStarred } from '@/lib/data/repository';
import type { ReviewLog, UserWordState, Word } from '@/lib/types';
import { formatDateTime, formatDueLabel } from '@/lib/time';
import { startSession } from '@/lib/study/sessionRunner';

type SortKey = 'lapses' | 'recent' | 'fuzzy';

export default function Mistakes() {
  const snapshot = useSnapshot();
  const { settings, pushToast } = useApp();
  const navigate = useNavigate();
  const [deckFilter, setDeckFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('lapses');
  const [historyWord, setHistoryWord] = useState<Word | null>(null);
  const [historyLogs, setHistoryLogs] = useState<ReviewLog[] | null>(null);
  const [busy, setBusy] = useState(false);

  const now = Date.now();

  const entries = useMemo(() => {
    if (!snapshot) return [];
    const deckByWord = new Map(snapshot.deckWords.map((l) => [l.wordId, l.deckId]));
    const wordById = new Map(snapshot.words.map((w) => [w.id, w]));
    return snapshot.states
      .filter((state) => state.isInErrorBook || state.isStarred)
      .filter((state) => {
        if (deckFilter === 'all') return true;
        return deckByWord.get(state.wordId) === deckFilter;
      })
      .map((state) => ({
        state,
        word: wordById.get(state.wordId),
        deckId: deckByWord.get(state.wordId) ?? 'none',
      }))
      .filter((row): row is { state: UserWordState; word: Word; deckId: string } => Boolean(row.word))
      .sort((a, b) => {
        if (sortKey === 'lapses') return b.state.lapseCount - a.state.lapseCount;
        if (sortKey === 'fuzzy') return b.state.fuzzyStreak - a.state.fuzzyStreak;
        return (b.state.lastReviewedAt ?? 0) - (a.state.lastReviewedAt ?? 0);
      });
  }, [snapshot, deckFilter, sortKey]);

  const showHistory = async (word: Word) => {
    setHistoryWord(word);
    setHistoryLogs(null);
    const logs = await db.reviewLogs.where('wordId').equals(word.id).toArray();
    setHistoryLogs(logs.sort((a, b) => b.reviewedAt - a.reviewedAt));
  };

  const startMistakes = async () => {
    setBusy(true);
    try {
      const result = await startSession({
        mode: 'mistakes',
        deckIds: deckFilter === 'all' ? settings.selectedDeckIds : [deckFilter],
        settings,
        now: Date.now(),
      });
      if (!result.session) {
        pushToast({ kind: 'info', title: '没有可练的薄弱词', description: '错词本为空，先去学几个新词吧。' });
        return;
      }
      navigate(`/study/${result.session.id}`);
    } catch (error) {
      pushToast({ kind: 'error', title: '无法开始', description: (error as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const toggleStar = async (row: { word: Word; state: UserWordState }) => {
    await setStarred(row.word.id, !row.state.isStarred, Date.now());
  };

  const remove = async (row: { word: Word; state: UserWordState }) => {
    if (row.state.isStarred && !window.confirm('该词已收藏，移出错词本后仍会出现在收藏中。继续？')) return;
    await setErrorBook(row.word.id, false, Date.now());
    pushToast({ kind: 'success', title: '已移出错词本', description: `${row.word.term} 的记忆状态保留不变。` });
  };

  if (!snapshot) return <Spinner label="正在读取错词本…" />;

  const totalErrors = snapshot.states.reduce((sum, s) => sum + s.lapseCount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="错词本"
        subtitle="「忘记」自动加入；连续两次「模糊」或累计 2 次遗忘也会进入。错词复习更新同一份记忆状态。"
        actions={
          <button type="button" className="btn-primary" onClick={() => void startMistakes()} disabled={busy || entries.length === 0}>
            <PlayCircle className="h-4 w-4" aria-hidden />
            只练薄弱词
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="错词本" value={snapshot.states.filter((s) => s.isInErrorBook).length} />
        <StatCard label="收藏" value={snapshot.states.filter((s) => s.isStarred).length} icon={<Star className="h-4 w-4" />} />
        <StatCard label="累计遗忘" value={totalErrors} />
        <StatCard
          label="今日可再练"
          value={snapshot.states.filter((s) => s.isInErrorBook && (s.nextReviewAt ?? 0) <= now).length}
        />
      </div>

      <div className="card card-pad flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted">
          词书
          <select
            className="input !w-auto !py-1.5 text-xs"
            value={deckFilter}
            onChange={(event) => setDeckFilter(event.target.value)}
          >
            <option value="all">全部</option>
            {snapshot.decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          排序
          <select
            className="input !w-auto !py-1.5 text-xs"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
          >
            <option value="lapses">错误次数</option>
            <option value="recent">最近错误时间</option>
            <option value="fuzzy">连续模糊</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-muted tabular-nums">{entries.length} 个词</span>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<BookX className="h-5 w-5" />}
          title="错词本还是空的"
          description="答错或连续标记「模糊」的单词会自动出现在这里；也可以在背词卡片上手动收藏。"
        />
      ) : (
        <ul className="space-y-2">
          {entries.map((row) => (
            <li key={row.word.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-lg font-semibold">{row.word.term}</h3>
                    <span className="font-mono text-xs text-muted">{row.word.phonetic}</span>
                    {row.state.isInErrorBook ? <span className="chip border-bad/30 bg-bad/10 text-bad">错词</span> : null}
                    {row.state.isStarred ? <span className="chip border-warn/30 bg-warn/10 text-warn">已收藏</span> : null}
                  </div>
                  <p className="mt-1 text-sm">
                    <span className="mr-1.5 text-xs text-muted">{row.word.partOfSpeech}</span>
                    {row.word.definitions.join('；')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1.5 !text-xs"
                    onClick={() => void showHistory(row.word)}
                  >
                    <History className="h-3.5 w-3.5" aria-hidden />
                    历史
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1.5 !text-xs"
                    onClick={() => void toggleStar(row)}
                    aria-label={row.state.isStarred ? '取消收藏' : '收藏'}
                  >
                    {row.state.isStarred ? <StarOff className="h-3.5 w-3.5" aria-hidden /> : <Star className="h-3.5 w-3.5" aria-hidden />}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !px-2 !py-1.5 !text-xs text-bad hover:text-bad"
                    onClick={() => void remove(row)}
                    aria-label="移出错词本"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div className="rounded-lg bg-surface px-2.5 py-1.5">
                  <dt className="text-muted">错误次数</dt>
                  <dd className="font-semibold tabular-nums text-bad">{row.state.lapseCount}</dd>
                </div>
                <div className="rounded-lg bg-surface px-2.5 py-1.5">
                  <dt className="text-muted">最近错误</dt>
                  <dd className="font-medium">{formatDateTime(row.state.lastReviewedAt)}</dd>
                </div>
                <div className="rounded-lg bg-surface px-2.5 py-1.5">
                  <dt className="text-muted">记忆状态</dt>
                  <dd className="font-medium">{row.state.state} · 稳定度 {row.state.stability.toFixed(1)}d</dd>
                </div>
                <div className="rounded-lg bg-surface px-2.5 py-1.5">
                  <dt className="text-muted">下次复习</dt>
                  <dd className="font-medium">{formatDueLabel(row.state.nextReviewAt, now)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      {historyWord ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${historyWord.term} 的复习历史`}
        >
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-raised p-5 shadow-lift sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-xl font-semibold">{historyWord.term}</h2>
                <p className="text-xs text-muted">{historyWord.definitions[0]}</p>
              </div>
              <button type="button" className="btn-ghost !px-2 !py-1" onClick={() => setHistoryWord(null)} aria-label="关闭">
                ✕
              </button>
            </div>
            {historyLogs === null ? (
              <Spinner label="读取历史…" />
            ) : historyLogs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">还没有复习记录。</p>
            ) : (
              <ul className="mt-4 divide-y divide-line/70">
                {historyLogs.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-muted">{formatDateTime(log.reviewedAt)}</span>
                    <span
                      className={
                        log.rating === 'known' ? 'text-ok' : log.rating === 'fuzzy' ? 'text-warn' : 'text-bad'
                      }
                    >
                      {log.rating === 'known' ? '认识' : log.rating === 'fuzzy' ? '模糊' : '忘记'}
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {log.scheduledDaysBefore.toFixed(2)}d → {log.scheduledDaysAfter.toFixed(2)}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      <InfoBanner tone="info">
        错词与本词书之外的学习共用同一条 UserWordState（wordId 唯一索引），不会产生相互冲突的重复记录。
      </InfoBanner>
    </div>
  );
}
