import { useId } from 'react';
import { Clock, Gauge, Sparkles, Target, Zap } from 'lucide-react';
import {
  DAILY_PRESETS,
  SECONDS_PER_CARD,
  applyPreset,
  cardsForMinutes,
  deriveFromMinutes,
  estimateWorkload,
  matchPreset,
  type DailyPresetId,
} from '@/lib/settings/dailyPlan';
import type { AppSettings } from '@/lib/types';

export interface DailyPlanPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  /** Optional: words still available, to warn when the plan exceeds them. */
  availableWords?: number;
}

const MIN_MINUTES = 5;
const MAX_MINUTES = 120;

/**
 * Daily workload controls: presets plus independent sliders for
 * "how many words per day" and "how many minutes per day".
 *
 * Every number shown here is derived from the settings and the same 20s/card
 * constant the session planner uses, so the preview matches what will actually
 * be scheduled.
 */
export function DailyPlanPanel({ settings, onChange, availableWords }: DailyPlanPanelProps) {
  const minutesId = useId();
  const wordsId = useId();
  const activePreset = matchPreset(settings);
  const workload = estimateWorkload(settings);
  const capacity = cardsForMinutes(settings.timeBudgetMinutes);

  const setMinutes = (minutes: number) => {
    // Dragging the time slider re-derives a coherent plan but keeps the
    // learner's explicit new-word choice if it still fits.
    onChange(deriveFromMinutes(minutes, settings.dailyNewLimit));
  };

  const setNewWords = (value: number) => {
    const clamped = Math.min(100, Math.max(0, value));
    // Give new words a matching review allowance so the plan stays workable.
    onChange({
      dailyNewLimit: clamped,
      dailyReviewLimit: Math.max(20, Math.min(500, Math.round(clamped * 5))),
      dailyGoalCount: Math.max(5, clamped * 2),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-brand" aria-hidden />
          每日学习量
        </h2>
        <span className="text-xs text-muted" data-testid="daily-plan-summary">
          约 {workload.wordsPerDay} 词 / 天 · 约 {settings.dailyGoalMinutes} 分钟
        </span>
      </div>

      {/* Presets */}
      <div>
        <p className="mb-2 text-xs text-muted">先选一个节奏，再用下面滑杆微调</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {DAILY_PRESETS.map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange(applyPreset(preset))}
                aria-pressed={active}
                className={`rounded-xl border p-2.5 text-left transition ${
                  active ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-surface'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">{preset.label}</span>
                  {active ? (
                    <span className="chip text-[9px] text-brand">当前</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{preset.hint}</span>
                <span className="mt-1 block text-[11px] tabular-nums text-muted">
                  {preset.dailyNewLimit} 新词 · {preset.dailyGoalMinutes} 分钟
                </span>
              </button>
            );
          })}
        </div>
        {activePreset === null ? (
          <p className="mt-1.5 text-[11px] text-muted">当前是自定义组合（不对应任何预设）</p>
        ) : null}
      </div>

      {/* Minutes slider */}
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={minutesId} className="flex items-center gap-1.5 text-sm font-medium">
            <Clock className="h-3.5 w-3.5 text-brand" aria-hidden />
            每天学习多久
          </label>
          <span className="text-sm font-semibold tabular-nums" data-testid="daily-minutes-value">
            {settings.dailyGoalMinutes} 分钟
          </span>
        </div>
        <input
          id={minutesId}
          type="range"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          step={5}
          value={Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, settings.dailyGoalMinutes))}
          onChange={(event) => setMinutes(Number(event.target.value))}
          className="mt-2 w-full accent-[rgb(var(--brand))]"
          aria-valuetext={`${settings.dailyGoalMinutes} 分钟，约 ${capacity} 张卡片`}
        />
        <div className="flex justify-between text-[10px] text-muted">
          <span>{MIN_MINUTES} 分钟</span>
          <span>约 {capacity} 张卡片（按每张 {SECONDS_PER_CARD} 秒）</span>
          <span>{MAX_MINUTES} 分钟</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[10, 15, 20, 30, 45, 60].map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setMinutes(minutes)}
              aria-pressed={settings.dailyGoalMinutes === minutes}
              className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                settings.dailyGoalMinutes === minutes
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {minutes} 分
            </button>
          ))}
        </div>
      </div>

      {/* New words slider */}
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor={wordsId} className="flex items-center gap-1.5 text-sm font-medium">
            <Zap className="h-3.5 w-3.5 text-brand" aria-hidden />
            每天学多少新词
          </label>
          <span className="text-sm font-semibold tabular-nums" data-testid="daily-new-value">
            {settings.dailyNewLimit} 词
          </span>
        </div>
        <input
          id={wordsId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={settings.dailyNewLimit}
          onChange={(event) => setNewWords(Number(event.target.value))}
          className="mt-2 w-full accent-[rgb(var(--brand))]"
          aria-valuetext={`每天 ${settings.dailyNewLimit} 个新词`}
        />
        <div className="flex justify-between text-[10px] text-muted">
          <span>0（只复习）</span>
          <span>每日复习上限 {settings.dailyReviewLimit} 词</span>
          <span>100</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[0, 5, 10, 15, 20, 30, 50].map((count) => (
            <button
              key={count}
              type="button"
              onClick={() => setNewWords(count)}
              aria-pressed={settings.dailyNewLimit === count}
              className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                settings.dailyNewLimit === count
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-muted hover:text-ink'
              }`}
            >
              {count === 0 ? '只复习' : `${count} 词`}
            </button>
          ))}
        </div>
      </div>

      {/* Consequence preview */}
      <div className="rounded-xl border border-line bg-surface p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden />
          按当前设置，每天大约
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <dt className="text-muted">新词</dt>
            <dd className="font-semibold tabular-nums">{settings.dailyNewLimit} 词</dd>
          </div>
          <div>
            <dt className="text-muted">复习</dt>
            <dd className="font-semibold tabular-nums">
              约 {Math.max(0, workload.wordsPerDay - settings.dailyNewLimit)} 词
            </dd>
          </div>
          <div>
            <dt className="text-muted">总词数</dt>
            <dd className="font-semibold tabular-nums" data-testid="daily-total-words">
              {workload.wordsPerDay} 词
            </dd>
          </div>
          <div>
            <dt className="text-muted">预计用时</dt>
            <dd className="font-semibold tabular-nums">{workload.minutes} 分钟</dd>
          </div>
        </dl>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
          <Target className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            复习量会随学过的词增多而上升，届时新词会自动减半（学习计划里称为「复习压力」），
            避免每天堆到做不完。
            {typeof availableWords === 'number' && availableWords > 0 ? (
              <>
                {' '}
                当前词库还剩 <strong>{availableWords}</strong> 个未学词，按 {settings.dailyNewLimit}
                {' '}词/天约需{' '}
                <strong>
                  {settings.dailyNewLimit > 0
                    ? Math.ceil(availableWords / settings.dailyNewLimit)
                    : '∞'}
                </strong>{' '}
                天学完。
              </>
            ) : null}
          </span>
        </p>
      </div>
    </div>
  );
}

/** Re-export so callers don't need a second import for the preset type. */
export type { DailyPresetId };
