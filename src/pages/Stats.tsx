import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart3,
  CalendarDays,
  Clock,
  Flame,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import { PageHeader, ProgressBar, Spinner, StatCard, Alert } from '@/components/ui';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useApp } from '@/providers/appContext';
import { buildTrend, summarise, emptyDailyStats } from '@/lib/stats';
import { getAchievements, ACHIEVEMENTS } from '@/lib/data/repository';
import { formatDuration, toDateKey } from '@/lib/time';

export default function StatsPage() {
  const snapshot = useSnapshot();
  const achievements = useLiveQuery(() => getAchievements(), [], []);
  const { settings } = useApp();
  const [range, setRange] = useState<7 | 30>(7);
  const now = Date.now();

  const derived = useMemo(() => {
    if (!snapshot) return null;
    const summary = summarise(snapshot.stats, snapshot.logs, now, settings.dailyGoalCount);
    const byKey = Object.fromEntries(snapshot.stats.map((s) => [s.dateKey, s]));
    const trend = buildTrend(byKey, range, now);
    const maxStudied = Math.max(1, ...trend.map((p) => p.studied));
    const today = byKey[toDateKey(now)] ?? emptyDailyStats(toDateKey(now), now);
    const weak = snapshot.states
      .filter((s) => s.isInErrorBook || s.fuzzyStreak > 0)
      .sort((a, b) => b.lapseCount - a.lapseCount)
      .slice(0, 6);
    const wordById = new Map(snapshot.words.map((w) => [w.id, w]));
    return { summary, trend, maxStudied, today, weak, wordById };
  }, [snapshot, settings.dailyGoalCount, range, now]);

  if (!snapshot || !derived) return <Spinner label="正在汇总学习数据…" />;
  const { summary, trend, maxStudied, today, weak, wordById } = derived;
  const todayPercent = Math.min(
    100,
    Math.round((today.studiedCount / Math.max(1, settings.dailyGoalCount)) * 100),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="统计"
        subtitle="全部数字都由 ReviewLog 与会话时长实时重算，刷新不会重复累计。"
        actions={
          <div className="flex rounded-xl border border-line bg-raised p-0.5">
            {([7, 30] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRange(value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  range === value ? 'bg-brand text-white' : 'text-muted hover:text-ink'
                }`}
                aria-pressed={range === value}
              >
                近 {value} 天
              </button>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="今日学习" value={today.studiedCount} hint={`目标 ${settings.dailyGoalCount} 词`} />
        <StatCard label="累计学习（去重）" value={summary.totalStudied} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="复习次数" value={summary.totalReviews} hint="含本节内重现" />
        <StatCard label="正确回忆率" value={`${summary.correctRecallRate}%`} hint="认识 / 全部反馈" />
        <StatCard label="遗忘次数" value={summary.totalForgot} />
        <StatCard label="连续打卡" value={`${summary.streak} 天`} icon={<Flame className="h-4 w-4" />} />
        <StatCard label="学习时长" value={formatDuration(summary.totalDuration)} icon={<Clock className="h-4 w-4" />} />
        <StatCard
          label="目标完成率"
          value={`${summary.goalCompletionRate}%`}
          hint={`达标天数 / ${summary.activeDays} 个活跃日（目标 ${settings.dailyGoalCount} 词/天）`}
          icon={<Target className="h-4 w-4" />}
        />
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="card card-pad">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand" aria-hidden />
              学习趋势
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-brand" aria-hidden /> 学过
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-ok" aria-hidden /> 认识
              </span>
            </div>
          </div>
          <div className="flex h-40 items-end gap-1.5 overflow-x-auto pb-1">
            {trend.map((point) => (
              <div key={point.dateKey} className="group flex min-w-[14px] flex-1 flex-col items-center gap-1">
                <div className="relative flex h-32 w-full items-end justify-center gap-0.5">
                  <div
                    className="w-1/2 rounded-t bg-brand/70 transition group-hover:bg-brand"
                    style={{ height: `${Math.max(point.studied ? 4 : 0, (point.studied / maxStudied) * 100)}%` }}
                    title={`${point.dateKey} 学过 ${point.studied} 词`}
                  />
                  <div
                    className="w-1/2 rounded-t bg-ok/60 transition group-hover:bg-ok"
                    style={{ height: `${Math.max(point.correct ? 4 : 0, (point.correct / maxStudied) * 100)}%` }}
                    title={`${point.dateKey} 认识 ${point.correct} 次`}
                  />
                </div>
                <span className="whitespace-nowrap text-[9px] text-muted">{point.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {range} 天内有 {trend.filter((p) => p.studied > 0).length} 天产生学习记录。
          </p>
        </div>

        <div className="card card-pad space-y-4">
          <h2 className="section-title">今日目标</h2>
          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-semibold tabular-nums">{today.studiedCount}</span>
              <span className="text-xs text-muted">/ {settings.dailyGoalCount} 词</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={today.studiedCount} max={Math.max(1, settings.dailyGoalCount)} />
            </div>
            <p className="mt-1.5 text-xs text-muted">完成度 {todayPercent}%</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-sm font-semibold tabular-nums">{today.newCount}</p>
              <p className="text-[11px] text-muted">新词</p>
            </div>
            <div className="rounded-xl bg-surface p-2.5">
              <p className="text-sm font-semibold tabular-nums">{today.reviewedCount}</p>
              <p className="text-[11px] text-muted">复习</p>
            </div>
          </div>
          <div className="rounded-xl border border-line/70 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted">等级</span>
              <span className="font-semibold">Lv.{summary.level.level}</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={summary.level.xpIntoLevel} max={summary.level.xpForLevel} />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              {summary.level.xpIntoLevel} / {summary.level.xpForLevel} XP · 总计 {summary.xp} XP
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-brand" aria-hidden />
            徽章进度
          </h2>
          <ul className="space-y-2.5">
            {(achievements ?? []).map((badge) => {
              const definition = ACHIEVEMENTS.find((a) => a.code === badge.code);
              const target = definition?.target ?? 1;
              return (
                <li key={badge.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className={badge.unlockedAt ? 'font-medium' : 'text-muted'}>
                      {badge.name}
                      {badge.unlockedAt ? ' ✓' : ''}
                    </span>
                    <span className="text-xs text-muted tabular-nums">
                      {badge.progress}/{target}
                    </span>
                  </div>
                  <div className="mt-1">
                    <ProgressBar value={badge.progress} max={target} tone={badge.unlockedAt ? 'ok' : 'brand'} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">{badge.description}</p>
                </li>
              );
            })}
            {(achievements ?? []).length === 0 ? (
              <li className="text-sm text-muted">完成第一次学习后会出现徽章进度。</li>
            ) : null}
          </ul>
        </div>

        <div className="card card-pad">
          <h2 className="section-title mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-brand" aria-hidden />
            薄弱词分布
          </h2>
          {weak.length === 0 ? (
            <p className="text-sm text-muted">还没有错词，继续保持。</p>
          ) : (
            <ul className="space-y-2">
              {weak.map((state) => {
                const word = wordById.get(state.wordId);
                if (!word) return null;
                return (
                  <li key={state.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span className="font-medium">{word.term}</span>
                      <span className="ml-2 text-xs text-muted">{word.definitions[0]}</span>
                    </span>
                    <span className="chip shrink-0 border-bad/30 bg-bad/10 text-bad">
                      遗忘 {state.lapseCount}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Alert tone="info" className="mt-4">
            「学过」按去重单词数计算，「复习过」只统计已学过词的再次反馈，「当前掌握」要求 state=review 且稳定度 ≥ 21 天。
          </Alert>
        </div>
      </section>
    </div>
  );
}
