import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  Flame,
  GraduationCap,
  Layers,
  RotateCcw,
  Sparkles,
  Target,
  Timer,
  Trophy,
} from 'lucide-react';
import { PageHeader, ProgressBar, Spinner, StatCard, InfoBanner, EmptyState } from '@/components/ui';
import { DailyPlanPanel } from '@/components/DailyPlanPanel';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useApp } from '@/providers/appContext';
import { summarise } from '@/lib/stats';
import { isDueToday } from '@/lib/scheduler';
import { formatDueLabel, toDateKey } from '@/lib/time';
import { getAchievements, isUnstudied } from '@/lib/data/repository';
import { useLiveQuery } from 'dexie-react-hooks';
import { startSession } from '@/lib/study/sessionRunner';
import type { AchievementRecord } from '@/lib/types';

export default function Dashboard() {
  const snapshot = useSnapshot();
  const achievements = useLiveQuery(() => getAchievements(), [], []);
  const { settings, updateSettings, pushToast } = useApp();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);

  const now = Date.now();
  const derived = useMemo(() => {
    if (!snapshot) return null;
    const stateByWord = new Map(snapshot.states.map((s) => [s.wordId, s]));
    const allowedDeckIds = settings.selectedDeckIds;
    const allowedWordIds = new Set(
      snapshot.deckWords
        .filter((link) => allowedDeckIds.length === 0 || allowedDeckIds.includes(link.deckId))
        .map((link) => link.wordId),
    );
    const scoped = snapshot.words.filter((w) => allowedWordIds.has(w.id));
    let dueNow = 0;
    let dueToday = 0;
    let fresh = 0;
    for (const word of scoped) {
      const state = stateByWord.get(word.id);
      if (isUnstudied(state)) {
        fresh += 1;
        continue;
      }
      if (state && state.nextReviewAt !== null && state.nextReviewAt <= now) dueNow += 1;
      if (state && state.nextReviewAt !== null && isDueToday(state.nextReviewAt, now)) dueToday += 1;
    }
    const resumable = snapshot.sessions
      .filter((s) => (s.status === 'active' || s.status === 'paused') && now - s.updatedAt < 43_200_000)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const summary = summarise(snapshot.stats, snapshot.logs, now, settings.dailyGoalCount);
    const todayKey = toDateKey(now);
    const todayStats = snapshot.stats.find((s) => s.dateKey === todayKey);
    return { dueNow, dueToday, fresh, resumable, summary, todayStats, totalWords: scoped.length };
  }, [snapshot, settings.selectedDeckIds, settings.dailyGoalCount, now]);

  const nextUp = useMemo(() => {
    if (!snapshot) return [];
    const stateByWord = new Map(snapshot.states.map((s) => [s.wordId, s]));
    return snapshot.words
      .filter((w) => {
        const state = stateByWord.get(w.id);
        return state?.nextReviewAt && state.nextReviewAt > now && state.nextReviewAt <= now + 86_400_000;
      })
      .sort(
        (a, b) =>
          (stateByWord.get(a.id)?.nextReviewAt ?? 0) - (stateByWord.get(b.id)?.nextReviewAt ?? 0),
      )
      .slice(0, 4)
      .map((word) => ({ word, state: stateByWord.get(word.id)! }));
  }, [snapshot, now]);

  const start = async (mode: 'mixed' | 'review' | 'new') => {
    setStarting(true);
    try {
      const result = await startSession({
        mode,
        deckIds: settings.selectedDeckIds,
        settings,
        now: Date.now(),
      });
      if (!result.session) {
        pushToast({
          kind: 'info',
          title: '暂时没有可学的单词',
          description:
            result.reason === 'no-new'
              ? '新词已用完或达到了今日上限，可以先做复习。'
              : '当前没有到期复习，稍后再来或去学几个新词。',
        });
        return;
      }
      navigate(`/study/${result.session.id}`);
    } catch (error) {
      pushToast({ kind: 'error', title: '无法开始学习', description: (error as Error).message });
    } finally {
      setStarting(false);
    }
  };

  if (!snapshot || !derived) return <Spinner label="正在读取本地学习数据…" />;

  const { summary, dueNow, dueToday, fresh, resumable, todayStats, totalWords } = derived;
  const goalPercent = Math.min(
    100,
    Math.round(((todayStats?.studiedCount ?? 0) / Math.max(1, settings.dailyGoalCount)) * 100),
  );
  const unlocked = (achievements as AchievementRecord[]).filter((a) => a.unlockedAt);

  return (
    <div className="space-y-6">
      <PageHeader
        title="今天也走一小步"
        subtitle={`${toDateKey(now)} · 本地学习数据，刷新不会丢失`}
        actions={
          <Link to="/settings" className="chip hover:text-ink">
            <Target className="h-3.5 w-3.5" aria-hidden />
            每日目标 {settings.dailyGoalCount} 词 / {settings.dailyGoalMinutes} 分钟
          </Link>
        }
      />

      {resumable ? (
        <div className="card card-pad flex flex-col gap-3 border-brand/40 bg-brand-soft/50 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
              <Layers className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">有一节未完成的会话</p>
              <p className="text-sm text-muted">
                已学习 {resumable.completedWordIds.length} / {resumable.sequence.length} 词 ·{' '}
                {new Date(resumable.updatedAt).toLocaleTimeString('zh-CN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                更新
              </p>
            </div>
          </div>
          <Link to={`/study/${resumable.id}`} className="btn-primary shrink-0">
            继续学习
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="今日概览">
        <StatCard
          label="到期复习"
          value={dueNow}
          hint={dueToday > dueNow ? `今日还有 ${dueToday - dueNow} 个稍后到期` : '按 nextReviewAt 实时计算'}
          icon={<RotateCcw className="h-4 w-4" />}
        />
        <StatCard
          label="可学新词"
          value={Math.min(fresh, settings.dailyNewLimit)}
          hint={`今日上限 ${settings.dailyNewLimit} · 词库剩余 ${fresh}`}
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="今日已学"
          value={todayStats?.studiedCount ?? 0}
          hint={`复习 ${todayStats?.reviewedCount ?? 0} · 新词 ${todayStats?.newCount ?? 0}`}
          icon={<GraduationCap className="h-4 w-4" />}
        />
        <StatCard
          label="连续打卡"
          value={`${summary.streak} 天`}
          hint={`累计活跃 ${summary.activeDays} 天`}
          icon={<Flame className="h-4 w-4" />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <div className="card card-pad space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title">今日任务</h2>
              <p className="mt-0.5 text-sm text-muted">
                先清到期复习，再学新词；压力大时会自动少排新词。
              </p>
            </div>
            <span className="chip-brand">
              <Timer className="h-3.5 w-3.5" aria-hidden />
              {settings.timeBudgetMinutes} 分钟预算
            </span>
          </div>

          {/* Inline daily-plan controls: the most common adjustment shouldn't
              require leaving the page the learner starts from. */}
          <details className="rounded-xl border border-line bg-surface/60">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              调整每天学多少 / 学多久
              <span className="ml-2 text-xs font-normal text-muted">
                当前 {settings.dailyNewLimit} 新词 · {settings.dailyGoalMinutes} 分钟
              </span>
            </summary>
            <div className="border-t border-line p-3">
              <DailyPlanPanel
                settings={settings}
                onChange={(patch) => updateSettings(patch)}
                availableWords={fresh}
              />
            </div>
          </details>

          <div className="space-y-4">
            <ProgressBar
              value={todayStats?.studiedCount ?? 0}
              max={Math.max(1, settings.dailyGoalCount)}
              label={`每日词数目标 ${goalPercent}%`}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <TaskTile
                title="到期复习"
                count={dueNow}
                unit="词"
                description={dueNow > 0 ? '已到期，优先安排' : '暂无到期复习'}
                tone={dueNow > 0 ? 'brand' : 'muted'}
              />
              <TaskTile
                title="新词学习"
                count={Math.min(fresh, settings.dailyNewLimit)}
                unit="词"
                description={fresh === 0 ? '该词书的词已全部学过' : `每日上限 ${settings.dailyNewLimit}`}
                tone="muted"
              />
              <TaskTile
                title="学习时长"
                count={Math.round((todayStats?.durationSeconds ?? 0) / 60)}
                unit="分钟"
                description={`目标 ${settings.dailyGoalMinutes} 分钟`}
                tone="muted"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="btn-primary flex-1"
              onClick={() => void start('mixed')}
              disabled={starting || (dueNow === 0 && fresh === 0)}            >
              {starting ? '准备中…' : dueNow > 0 ? `开始学习（${Math.min(dueNow, settings.dailyReviewLimit)} 复习）` : '开始学习'}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void start('review')}
              disabled={starting || (dueNow === 0 && !todayStats)}
            >
              只复习
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void start('new')}
              disabled={starting || fresh === 0}
            >
              只学新词
            </button>
          </div>

          {totalWords === 0 ? (
            <InfoBanner tone="warn" title="当前词书没有单词">
              请到 <Link className="link" to="/decks">词书</Link> 页面选择或导入词书。
            </InfoBanner>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <h2 className="section-title">等级与经验</h2>
              <span className="chip">Lv.{summary.level.level}</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              {summary.level.xpIntoLevel} / {summary.level.xpForLevel} XP · 累计 {summary.xp} XP
            </p>
            <div className="mt-2">
              <ProgressBar value={summary.level.xpIntoLevel} max={summary.level.xpForLevel} />
            </div>
            <p className="mt-3 text-xs text-muted">
              经验值只来自真实反馈（认识 4 + 新词 3 / 模糊 2 / 忘记 1），重复提交不会重复计分。
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{summary.correctRecallRate}%</p>
                <p className="text-[11px] text-muted">累计正确回忆率</p>
              </div>
              <div className="rounded-xl bg-surface p-2.5">
                <p className="text-lg font-semibold tabular-nums">{summary.totalStudied}</p>
                <p className="text-[11px] text-muted">累计学过（去重）</p>
              </div>
            </div>
          </div>

          <div className="card card-pad">
            <div className="flex items-center justify-between">
              <h2 className="section-title">徽章</h2>
              <Link to="/stats" className="text-xs text-brand hover:underline">
                查看全部
              </Link>
            </div>
            {unlocked.length === 0 ? (
              <p className="mt-2 text-sm text-muted">还没有解锁徽章，完成第一组学习就会得到「第一步」。</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {unlocked.slice(0, 6).map((badge) => (
                  <li key={badge.id} className="chip-brand" title={badge.description}>
                    <Trophy className="h-3.5 w-3.5" aria-hidden />
                    {badge.name}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">接下来到期</h2>
            <Link to="/review" className="text-xs text-brand hover:underline">
              复习队列
            </Link>
          </div>
          {nextUp.length === 0 ? (
            <p className="text-sm text-muted">24 小时内没有计划到期的单词。</p>
          ) : (
            <ul className="divide-y divide-line/70">
              {nextUp.map(({ word, state }) => (
                <li key={word.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{word.term}</p>
                    <p className="truncate text-xs text-muted">
                      {word.partOfSpeech} {word.definitions[0]}
                    </p>
                  </div>
                  <span className="chip shrink-0">{formatDueLabel(state.nextReviewAt, now)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card card-pad">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title">词书进度</h2>
            <Link to="/decks" className="text-xs text-brand hover:underline">
              全部词书
            </Link>
          </div>
          {snapshot.decks.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title="还没有词书"
              description="导入你自己的 CET-4 / CET-6 词表，或使用内置演示词书。"
              action={
                <Link to="/decks" className="btn-primary">
                  去词书页
                </Link>
              }
            />
          ) : (
            <ul className="space-y-3">
              {snapshot.decks.slice(0, 3).map((deck) => {
                const ids = new Set(
                  snapshot.deckWords.filter((l) => l.deckId === deck.id).map((l) => l.wordId),
                );
                const learned = snapshot.states.filter(
                  (s) => ids.has(s.wordId) && s.lastReviewedAt !== null,
                ).length;
                return (
                  <li key={deck.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate font-medium">{deck.name}</span>
                      <span className="text-xs text-muted tabular-nums">
                        {learned}/{ids.size}
                      </span>
                    </div>
                    <ProgressBar value={learned} max={Math.max(1, ids.size)} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <InfoBanner tone="info" title="关于数据">
        当前版本使用浏览器 IndexedDB 保存学习记录，不登录、不上传。换设备或清理浏览器数据前，请到{' '}
        <Link to="/settings" className="link">
          设置
        </Link>{' '}
        导出 JSON 备份。排行榜为本地演示状态，没有真实用户数据。
        <CalendarCheck className="ml-1 inline h-3.5 w-3.5" aria-hidden />
      </InfoBanner>
    </div>
  );
}

function TaskTile({
  title,
  count,
  unit,
  description,
  tone,
}: {
  title: string;
  count: number;
  unit: string;
  description: string;
  tone: 'brand' | 'muted';
}) {
  return (
    <div className={`rounded-xl border p-3 ${tone === 'brand' ? 'border-brand/30 bg-brand-soft/40' : 'border-line bg-surface/60'}`}>
      <p className="text-xs font-medium text-muted">{title}</p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">
        {count}
        <span className="ml-1 text-xs font-normal text-muted">{unit}</span>
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{description}</p>
    </div>
  );
}
