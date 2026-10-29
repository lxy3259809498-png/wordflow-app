import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  Gauge,
  HelpCircle,
  Lightbulb,
  Sparkles,
  Star,
  Volume2,
  X,
  XCircle,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Rating, ReviewMode, Word } from '@/lib/types';
import { buildChoiceOptions, checkSpelling, type ChoiceOption } from '@/lib/study/answerCheck';
import { bestPhonetic } from '@/lib/audio/pronunciationService';

export interface StudyCardProps {
  word: Word;
  reviewMode: ReviewMode;
  revealed: boolean;
  onReveal: () => void;
  onRate: (rating: Rating) => void;
  onSpeak: () => void;
  /** Slow playback, wired to the same pronunciation service with rate 0.55. */
  onSpeakSlow?: () => void;
  speaking?: boolean;
  speechSupported?: boolean;
  accentLabel?: string;
  /** Which accent the phonetic line refers to. */
  accent?: 'US' | 'UK';
  /** Human-readable source of the last playback, e.g. "录音" or "系统语音: Samantha". */
  playbackNote?: string | null;
  playbackError?: string | null;
  disabled?: boolean;
  /** Session context, e.g. 主动回忆 / 错词强化. */
  modeLabel?: string;
  /** Manual favourite, persisted on the same UserWordState row. */
  starred?: boolean;
  onToggleStar?: () => void;
  /** Other words used to build multiple-choice distractors. */
  distractorPool?: Word[];
}

/**
 * Pure presentational card — no data access, no clock. This keeps the core
 * recall → answer → rate loop unit-testable with React Testing Library.
 */
export function StudyCard({
  word,
  reviewMode,
  revealed,
  onReveal,
  onRate,
  onSpeak,
  onSpeakSlow,
  speaking = false,
  speechSupported = true,
  accentLabel = 'US',
  accent = 'US',
  playbackNote = null,
  playbackError = null,
  disabled = false,
  modeLabel,
  starred = false,
  onToggleStar,
  distractorPool = [],
}: StudyCardProps) {
  const isZhEn = reviewMode === 'zh-en';
  const isSpelling = reviewMode === 'spelling';
  const isChoice = reviewMode === 'choice';
  const phonetic = bestPhonetic(word, accent);

  const [typed, setTyped] = useState('');
  const [spellChecked, setSpellChecked] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset local answer state whenever the card changes.
  useEffect(() => {
    setTyped('');
    setSpellChecked(false);
    setPicked(null);
  }, [word.id, reviewMode]);

  const options: ChoiceOption[] = useMemo(
    () => (isChoice ? buildChoiceOptions(word, distractorPool) : []),
    [distractorPool, isChoice, word],
  );

  const spelling = useMemo(
    () => (isSpelling && spellChecked ? checkSpelling(typed, word.term) : null),
    [isSpelling, spellChecked, typed, word.term],
  );
  const chosenOption = options.find((option) => option.definition === picked) ?? null;
  const answeredWrong = (spellChecked && spelling && !spelling.correct) || (picked !== null && chosenOption?.correct === false);
  const answeredRight = (spellChecked && spelling?.correct) || (picked !== null && chosenOption?.correct === true);
  const suggested: Rating | null = answeredRight ? 'known' : answeredWrong ? 'forgot' : null;

  const submitSpelling = () => {
    if (!typed.trim()) return;
    setSpellChecked(true);
    onReveal();
  };

  const pickOption = (option: ChoiceOption) => {
    if (picked !== null) return;
    setPicked(option.definition);
    onReveal();
  };

  const modeHint = isZhEn
    ? '看中文，想英文'
    : isSpelling
      ? '看中文，拼出英文'
      : isChoice
        ? '看英文，选出释义'
        : '先回忆，再翻卡';

  const defaultChip = isZhEn ? '中译英' : isSpelling ? '纯拼写' : isChoice ? '选择题' : '主动回忆';

  const promptTerm = !isZhEn && !isSpelling;

  return (
    <article className="card animate-card-in overflow-hidden" aria-live="polite">
      <div className="border-b border-line/70 bg-gradient-to-br from-brand-soft/70 to-transparent px-5 py-6 sm:px-8 sm:py-9">
        <div className="flex items-start justify-between gap-3">
          <span className="chip">{modeLabel ?? defaultChip}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">{modeHint}</span>
            {onToggleStar ? (
              <button
                type="button"
                onClick={onToggleStar}
                className={`rounded-lg p-1.5 transition ${
                  starred ? 'text-warn' : 'text-muted hover:text-ink'
                }`}
                aria-pressed={starred}
                aria-label={starred ? `取消收藏 ${word.term}` : `收藏 ${word.term}`}
                title={starred ? '取消收藏' : '加入收藏（错词本会显示）'}
              >
                <Star className="h-4 w-4" aria-hidden fill={starred ? 'currentColor' : 'none'} />
              </button>
            ) : null}
          </div>
        </div>

        {promptTerm ? (
          <>
            <h1
              className="mt-5 break-words font-display text-4xl font-semibold tracking-tight sm:text-5xl"
              data-testid="word-term"
            >
              {word.term}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <span className="font-mono text-sm text-muted" data-testid="phonetic">
                {phonetic ? `${accent === 'UK' ? '英' : '美'} ${phonetic}` : '无音标'}
              </span>
              <SpeakButton
                label={`${accentLabel} 发音`}
                ariaLabel={`播放 ${word.term} 的发音`}
                speaking={speaking}
                onClick={onSpeak}
              />
              {onSpeakSlow ? (
                <button
                  type="button"
                  onClick={onSpeakSlow}
                  className="btn-ghost !py-1.5 !text-xs"
                  aria-label={`慢速播放 ${word.term} 的发音`}
                  disabled={speaking}
                >
                  <Gauge className="h-3.5 w-3.5" aria-hidden />
                  慢速
                </button>
              ) : null}
              {!speechSupported && !word.audioUS && !word.audioUK ? (
                <span className="text-xs text-warn">此词无录音且系统无英语语音，发音不可用</span>
              ) : playbackError ? (
                <span className="text-xs text-warn">{playbackError}</span>
              ) : playbackNote ? (
                <span className="text-[11px] text-muted">{playbackNote}</span>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="mt-5 text-xs font-medium uppercase tracking-wide text-muted">
              {isSpelling ? '根据中文拼写英文' : '根据中文回想英文'}
            </p>
            <h1 className="mt-2 font-display text-2xl font-semibold leading-snug sm:text-3xl">
              {word.definitions[0]}
            </h1>
            {word.definitions[1] ? (
              <p className="mt-1 text-base text-muted">{word.definitions[1]}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted">
              {word.partOfSpeech}
              {isSpelling ? ` · 共 ${word.term.replace(/[^a-zA-Z]/g, '').length} 个字母` : ''}
            </p>
          </>
        )}
      </div>

      <div className="px-5 py-5 sm:px-8 sm:py-6">
        {!revealed ? (
          <div className="space-y-4">
            {isSpelling ? (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSpelling();
                }}
              >
                <label className="label" htmlFor="spelling-input">
                  输入英文单词
                </label>
                <input
                  id="spelling-input"
                  ref={inputRef}
                  data-testid="spelling-input"
                  className="input text-lg tracking-wide"
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  placeholder="在这里拼写…"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  autoFocus
                  disabled={disabled}
                />
                <div className="flex gap-2">
                  <button type="submit" className="btn-primary flex-1" disabled={!typed.trim() || disabled}>
                    <Check className="h-4 w-4" aria-hidden />
                    检查拼写
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !text-xs"
                    onClick={() => {
                      setTyped('');
                      setSpellChecked(true);
                      onReveal();
                    }}
                  >
                    不会，看答案
                  </button>
                </div>
              </form>
            ) : isChoice ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">选择正确释义</p>
                <div className="grid gap-2">
                  {options.map((option) => (
                    <button
                      key={option.definition}
                      type="button"
                      data-testid="choice-option"
                      onClick={() => pickOption(option)}
                      className="rounded-xl border border-line bg-surface/70 px-4 py-3 text-left text-sm font-medium transition hover:border-brand/50 hover:bg-brand-soft/40"
                    >
                      {option.definition}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-ghost !text-xs"
                  onClick={() => {
                    setPicked('');
                    onReveal();
                  }}
                >
                  不会，直接看答案
                </button>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-dashed border-line bg-surface/60 px-4 py-6 text-center">
                  <p className="text-sm text-muted">
                    {isZhEn ? '在脑中说出英文单词，再查看答案。' : '先在心里说出中文意思，再翻卡确认。'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-primary w-full py-3 text-base"
                  onClick={onReveal}
                  autoFocus
                >
                  <Eye className="h-4 w-4" aria-hidden />
                  显示答案
                  <span className="ml-1 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-normal sm:inline">
                    空格
                  </span>
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="animate-pop space-y-5">
            {(isSpelling || isChoice) ? (
              <AnswerBanner
                mode={isSpelling ? 'spelling' : 'choice'}
                correct={Boolean(answeredRight)}
                spelling={spelling}
                word={word}
                picked={picked}
                options={options}
              />
            ) : null}

            {(isZhEn || isSpelling) ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-3xl font-semibold">{word.term}</h2>
                <div className="flex items-center gap-2">
                  <SpeakButton
                    label="发音"
                    ariaLabel={`播放 ${word.term} 的发音`}
                    speaking={speaking}
                    onClick={onSpeak}
                  />
                  {onSpeakSlow ? (
                    <button
                      type="button"
                      onClick={onSpeakSlow}
                      className="btn-ghost !py-1.5 !text-xs"
                      aria-label={`慢速播放 ${word.term} 的发音`}
                      disabled={speaking}
                    >
                      <Gauge className="h-3.5 w-3.5" aria-hidden />
                      慢速
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!isZhEn ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">释义</p>
                <ul className="space-y-1">
                  {word.definitions.map((definition) => (
                    <li key={definition} className="text-lg font-medium">
                      <span className="mr-2 text-sm font-normal text-muted">{word.partOfSpeech}</span>
                      {definition}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">音标</p>
                <p className="font-mono text-sm text-muted">{phonetic || '无音标'}</p>
              </div>
            )}

            {word.examples.length > 0 ? (
              <div className="space-y-1.5 rounded-xl bg-surface/80 p-3.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">例句</p>
                <p className="text-sm leading-relaxed">{word.examples[0].en}</p>
                <p className="text-sm text-muted">{word.examples[0].zh}</p>
              </div>
            ) : (
              <p className="text-sm text-muted">这个词条暂无例句。</p>
            )}

            {word.mnemonic ? (
              <div className="flex gap-2 rounded-xl border border-brand/25 bg-brand-soft/50 p-3.5">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className="text-xs font-semibold text-brand">记忆提示</p>
                  <p className="mt-0.5 text-sm text-ink/90">{word.mnemonic}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted">记忆提示：待生成（未配置 AI 服务时不会伪造内容）。</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              <RatingButton
                tone="ok"
                label="认识"
                hint="能正确回忆"
                shortcut="1"
                onClick={() => onRate('known')}
                disabled={disabled}
                suggested={suggested === 'known'}
                icon={<Check className="h-4 w-4" aria-hidden />}
              />
              <RatingButton
                tone="warn"
                label="模糊"
                hint="知道一点"
                shortcut="2"
                onClick={() => onRate('fuzzy')}
                disabled={disabled}
                suggested={false}
                icon={<HelpCircle className="h-4 w-4" aria-hidden />}
              />
              <RatingButton
                tone="bad"
                label="忘记"
                hint="完全想不起"
                shortcut="3"
                onClick={() => onRate('forgot')}
                disabled={disabled}
                suggested={suggested === 'forgot'}
                icon={<X className="h-4 w-4" aria-hidden />}
              />
            </div>
            <p className="text-center text-[11px] text-muted">
              {suggested
                ? `系统建议「${suggested === 'known' ? '认识' : '忘记'}」，也可以按实际情况选择`
                : '键盘：1 认识 · 2 模糊 · 3 忘记 · S 发音'}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

function SpeakButton({
  label,
  ariaLabel,
  speaking,
  onClick,
}: {
  label: string;
  ariaLabel: string;
  speaking: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn-secondary !py-1.5 !text-xs"
      aria-label={ariaLabel}
      disabled={speaking}
    >
      <Volume2 className="h-3.5 w-3.5" aria-hidden />
      {speaking ? '播放中…' : label}
    </button>
  );
}

function AnswerBanner({
  mode,
  correct,
  spelling,
  word,
  picked,
  options,
}: {
  mode: 'spelling' | 'choice';
  correct: boolean;
  spelling: ReturnType<typeof checkSpelling> | null;
  word: Word;
  picked: string | null;
  options: ChoiceOption[];
}) {
  const skipped = mode === 'choice' && picked === '';
  const Icon = correct ? CheckCircle2 : XCircle;
  const tone = correct
    ? 'border-ok/40 bg-ok/10 text-ok'
    : skipped
      ? 'border-line bg-surface text-muted'
      : 'border-bad/40 bg-bad/10 text-bad';

  return (
    <div className={`rounded-xl border p-3.5 ${tone}`}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" aria-hidden />
        {correct
          ? '回答正确'
          : skipped
            ? '已跳过，先看答案再决定'
            : mode === 'spelling'
              ? '拼写不对'
              : '选错了'}
      </div>
      {mode === 'spelling' ? (
        <p className="mt-1 text-sm text-ink/90">
          正确拼写：<span className="font-mono font-semibold">{word.term}</span>
          {spelling?.closeness === 'near' ? '（只差一点，注意细节）' : ''}
        </p>
      ) : (
        <div className="mt-1 space-y-1 text-sm">
          {options.map((option) => (
            <p
              key={option.definition}
              className={
                option.correct
                  ? 'font-medium text-ok'
                  : option.definition === picked
                    ? 'text-bad line-through'
                    : 'text-muted'
              }
            >
              {option.correct ? '✓ ' : option.definition === picked ? '✗ ' : '· '}
              {option.definition}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingButton({
  tone,
  label,
  hint,
  shortcut,
  onClick,
  disabled,
  icon,
  suggested = false,
}: {
  tone: 'ok' | 'warn' | 'bad';
  label: string;
  hint: string;
  shortcut: string;
  onClick: () => void;
  disabled?: boolean;
  icon: ReactNode;
  suggested?: boolean;
}) {
  const styles =
    tone === 'ok'
      ? 'border-ok/40 bg-ok/10 text-ok hover:bg-ok/15'
      : tone === 'warn'
        ? 'border-warn/40 bg-warn/10 text-warn hover:bg-warn/15'
        : 'border-bad/40 bg-bad/10 text-bad hover:bg-bad/15';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-semibold transition disabled:opacity-50 ${styles} ${
        suggested ? 'ring-2 ring-offset-1 ring-offset-raised ring-current' : ''
      }`}
      aria-keyshortcuts={shortcut}
    >
      {suggested ? (
        <span className="absolute -top-2 right-1 flex items-center gap-0.5 rounded-full bg-raised px-1.5 py-0.5 text-[9px] font-semibold text-brand shadow-sm">
          <Lightbulb className="h-2.5 w-2.5" aria-hidden />
          建议
        </span>
      ) : null}
      <span className="flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="text-[11px] font-normal opacity-80">{hint}</span>
      <span className="rounded bg-black/5 px-1 text-[10px] font-normal opacity-70 dark:bg-white/10">
        {shortcut}
      </span>
    </button>
  );
}
