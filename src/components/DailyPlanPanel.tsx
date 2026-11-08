import { useId } from 'react';
import { Gauge, Sparkles, Target, Zap } from 'lucide-react';
import {
  DAILY_PRESETS,
  SECONDS_PER_CARD,
  applyPreset,
  cardsForMinutes,
  daysToFinish,
  deriveFromWords,
  estimateWorkload,
  matchPreset,
  type DailyPresetId,
} from '@/lib/settings/dailyPlan';
import type { AppSettings } from '@/lib/types';

export interface DailyPlanPanelProps {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  /** Optional: unlearned words left, to show "days to finish". */
  availableWords?: number;
}

/**
 * Daily workload controls.
 *
 * Single knob: **new words per day**. Time is shown as a derived estimate, not
 * asked for — having both a word target and a minute target let the two disagree
 * and forced the learner to guess which one decided the session.
 */
export function DailyPlanPanel({ settings, onChange, availableWords }: DailyPlanPanelProps) {
  const wordsId = useId();
  const activePreset = matchPreset(settings);
  const workload = estimateWorkload(settings);
  const capacity = cardsForMinutes(settings.timeBudgetMinutes);
  const finishDays = daysToFinish(availableWords ?? 0, settings.dailyNewLimit);

  const setNewWords = (value: number) => {
    onChange(deriveFromWords(value));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-brand" aria-hidden />
          每天学多少
        </h2>
        <span className="text-xs text-muted" data-testid="daily-plan-summary">
          约 {workload.wordsPerDay} 词 / 天 · 约 {workload.minutes} 分钟
        </span>
      </div>

      {/* Presets */}
      <div>
        <p className="mb-2 text-xs text-muted">先选一个节奏，或直接拖动下面的滑杆</p>
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
                  {active ? <span className="chip text-[9px] text-brand">当前</span> : null}
                </span>
                <span className="mt-0.5 block text-[11px] text-muted">{preset.hint}</span>
                <span className="mt-1 block text-[11px] tabular-nums text-muted">
                  {preset.dailyNewLimit} 新词 · 复习上限 {preset.dailyReviewLimit}
                </span>
              </button>
            );
          })}
        </div>
        {activePreset === null ? (
          <p className="mt-1.5 text-[11px] text-muted">当前是自定义组合（不对应任何预设）</p>
        ) : null}
      </div>

      {/* New words slider — the only knob */}
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
          aria-valuetext={`每天 ${settings.dailyNewLimit} 个新词，约 ${workload.minutes} 分钟`}
        />
        <div className="flex justify-between text-[10px] text-muted">
          <span>0（只复习）</span>
          <span>预计用时约 {workload.minutes} 分钟</span>
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
            <dd className="font-semibold tabular-nums" data-testid="daily-estimated-minutes">
              {workload.minutes} 分钟
            </dd>
          </div>
        </dl>
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
          <Target className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>
            用时按每张卡 {SECONDS_PER_CARD} 秒估算，仅供参照，不需要单独设置。
            复习量会随学过的词增多而上升，届时新词会自动减半，避免每天堆到做不完。
            {typeof availableWords === 'number' && availableWords > 0 ? (
              <>
                {' '}
                当前词库还剩 <strong>{availableWords}</strong> 个未学词，按{' '}
                {settings.dailyNewLimit} 词/天约需 <strong>{finishDays ?? '∞'}</strong> 天学完。
              </>
            ) : null}
          </span>
        </p>
        <p className="mt-1.5 text-[10px] text-muted">
          单次会话上限约 {capacity} 张卡（自动计算，防止一次排太多）。
        </p>
      </div>
    </div>
  );
}

/** Re-export so callers don't need a second import for the preset type. */
export type { DailyPresetId };
