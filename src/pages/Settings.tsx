import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Bot,
  Check,
  Database,
  Download,
  HardDriveDownload,
  Keyboard,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  Sparkles,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import { PageHeader, InfoBanner, Spinner } from '@/components/ui';
import { DailyPlanPanel } from '@/components/DailyPlanPanel';
import { useApp } from '@/providers/appContext';
import { db, wipeDatabase } from '@/lib/db/db';
import { exportBackup, restoreBackup, saveAiExample, getAiExamples } from '@/lib/data/repository';
import { validateBackup } from '@/lib/data/backup';
import { aiService } from '@/lib/ai/aiService';
import { DEFAULT_SETTINGS } from '@/lib/settings/settings';
import { formatDateTime } from '@/lib/time';
import { getPronunciationService } from '@/lib/audio/pronunciationService';
import { usePronunciation } from '@/hooks/usePronunciation';
import { ORDER_LABELS, type WordOrder } from '@/lib/study/ordering';
import type { Accent, AiExamplePayload, AudioSpeed, ReviewMode } from '@/lib/types';

type Tab = 'learning' | 'appearance' | 'data' | 'ai' | 'about';

const TABS: { id: Tab; label: string; icon: typeof Settings2 }[] = [
  { id: 'learning', label: '学习', icon: Settings2 },
  { id: 'appearance', label: '外观与发音', icon: Palette },
  { id: 'data', label: '数据与备份', icon: Database },
  { id: 'ai', label: 'AI 例句', icon: Bot },
  { id: 'about', label: '关于', icon: AlertTriangle },
];

export default function SettingsPage() {
  const { settings, updateSettings, resetSettings, pushToast } = useApp();
  const [tab, setTab] = useState<Tab>('learning');
  const [restoreRaw, setRestoreRaw] = useState('');
  const [restorePreview, setRestorePreview] = useState<ReturnType<typeof validateBackup> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [voiceInfo, setVoiceInfo] = useState(() => {
    const env = getPronunciationService().describeEnvironment();
    return { supported: env.speechSupported, us: env.usCount, uk: env.ukCount };
  });
  const pronunciation = usePronunciation();
  const [aiWord, setAiWord] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const examples = useLiveQuery(() => getAiExamples(), [], new Map<string, AiExamplePayload>());

  const storedSummary = useMemo(() => settings, [settings]);

  /** Words with no study state yet — lets the plan show "days to finish". */
  const availableWords = useLiveQuery(async () => {
    const [words, states] = await Promise.all([
      db.words.count(),
      db.userWordStates.count(),
    ]);
    return Math.max(0, words - states);
  }, [], 0);

  const refreshVoices = () => {
    void getPronunciationService()
      .ensureVoices()
      .then(() => {
        const env = getPronunciationService().describeEnvironment();
        setVoiceInfo({ supported: env.speechSupported, us: env.usCount, uk: env.ukCount });
      });
  };

  const downloadBackup = async () => {
    try {
      const doc = await exportBackup(Date.now());
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `wordflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast({
        kind: 'success',
        title: '备份已导出',
        description: `${doc.words.length} 个单词 · ${doc.reviewLogs.length} 条复习记录`,
      });
    } catch (error) {
      pushToast({ kind: 'error', title: '导出失败', description: (error as Error).message });
    }
  };

  const handleRestoreFile = async (file: File) => {
    const text = await file.text();
    setRestoreRaw(text);
    setRestorePreview(validateBackup(text));
  };

  const confirmRestore = async () => {
    if (!restorePreview?.ok) return;
    const result = await restoreBackup(restoreRaw, Date.now());
    if (result.ok) {
      setRestorePreview(null);
      setRestoreRaw('');
      pushToast({ kind: 'success', title: '恢复完成', description: '数据已替换，统计会从日志重算。' });
    } else {
      pushToast({ kind: 'error', title: '恢复失败', description: result.errors.join('；') });
    }
  };

  const testAi = async () => {
    const word = await db.words.where('normalizedTerm').equals(aiWord.trim().toLowerCase()).first();
    if (!word) {
      setAiResult('本地词库中找不到这个单词，请先在词书中导入。');
      return;
    }
    setAiBusy(true);
    setAiResult(null);
    const result = await aiService.generate({
      wordId: word.id,
      term: word.term,
      definitions: word.definitions,
    });
    if (result.ok && result.data) {
      await saveAiExample(result.data);
      setAiResult(`已生成并缓存：${result.data.sentence}`);
    } else {
      setAiResult(result.message ?? '未配置');
    }
    setAiBusy(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader title="设置" subtitle="所有设置保存在本机 localStorage，仅影响当前浏览器。" />

      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="设置分类">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
              tab === item.id ? 'bg-brand text-white' : 'bg-raised text-muted hover:text-ink'
            }`}
          >
            <item.icon className="h-3.5 w-3.5" aria-hidden />
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'learning' ? (
        <section className="space-y-4">
          <div className="card card-pad">
            <DailyPlanPanel
              settings={settings}
              onChange={(patch) => updateSettings(patch)}
              availableWords={availableWords}
            />
          </div>

          <details className="card card-pad">
            <summary className="cursor-pointer text-sm font-medium">
              高级：单独调整每个上限
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <NumberField
                id="dailyNewLimit"
                label="每日新词上限"
                value={settings.dailyNewLimit}
                min={0}
                max={100}
                hint="复习压力大时会自动减半"
                onChange={(value) => updateSettings({ dailyNewLimit: value })}
              />
              <NumberField
                id="dailyReviewLimit"
                label="每日复习上限"
                value={settings.dailyReviewLimit}
                min={0}
                max={500}
                hint="超出部分顺延，不会丢失"
                onChange={(value) => updateSettings({ dailyReviewLimit: value })}
              />
              <NumberField
                id="timeBudgetMinutes"
                label="单次时间预算（分钟）"
                value={settings.timeBudgetMinutes}
                min={1}
                max={240}
                hint="按每卡约 20 秒估算"
                onChange={(value) => updateSettings({ timeBudgetMinutes: value })}
              />
              <NumberField
                id="dailyGoalCount"
                label="每日词数目标"
                value={settings.dailyGoalCount}
                min={1}
                max={200}
                hint="用于首页进度与打卡判定"
                onChange={(value) => updateSettings({ dailyGoalCount: value })}
              />
              <NumberField
                id="dailyGoalMinutes"
                label="每日时长目标（分钟）"
                value={settings.dailyGoalMinutes}
                min={0}
                max={240}
                onChange={(value) => updateSettings({ dailyGoalMinutes: value })}
              />
            </div>
          </details>

          <div className="card card-pad space-y-3">
            <h2 className="section-title">单词顺序</h2>
            <p className="text-xs text-muted">新词的出场顺序；到期复习始终按到期时间排序。</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(ORDER_LABELS) as WordOrder[]).map((value) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition ${
                    settings.wordOrder === value ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="wordOrder"
                    className="mt-0.5 accent-[rgb(var(--brand))]"
                    checked={settings.wordOrder === value}
                    onChange={() => updateSettings({ wordOrder: value })}
                  />
                  <span>
                    <span className="font-medium">{ORDER_LABELS[value].label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{ORDER_LABELS[value].hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="card card-pad space-y-3">
            <h2 className="section-title">练习模式</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ['en-zh', '英译中', '看英文回忆中文，默认模式'],
                  ['zh-en', '中译英', '看中文回忆英文拼写'],
                  ['spelling', '纯拼写', '看中文，逐字母拼出英文，自动判分'],
                  ['choice', '选择题', '从 4 个释义中选择，自动判分'],
                ] as [ReviewMode, string, string][]
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm transition ${
                    settings.reviewMode === value ? 'border-brand bg-brand-soft/50' : 'border-line hover:bg-surface'
                  }`}
                >
                  <input
                    type="radio"
                    name="reviewMode"
                    className="mt-0.5 accent-[rgb(var(--brand))]"
                    checked={settings.reviewMode === value}
                    onChange={() => updateSettings({ reviewMode: value })}
                  />
                  <span>
                    <span className="font-medium">{label}</span>
                    <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {tab === 'appearance' ? (
        <section className="space-y-4">
          <div className="card card-pad space-y-3">
            <h2 className="section-title">主题</h2>
            <div className="flex gap-2">
              {(
                [
                  ['light', '浅色'],
                  ['dark', '深色'],
                  ['system', '跟随系统'],
                ] as ['light' | 'dark' | 'system', string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateSettings({ theme: value })}
                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    settings.theme === value ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-raised text-muted'
                  }`}
                  aria-pressed={settings.theme === value}
                >
                  {label}
                </button>
              ))}
            </div>
            <div>
              <span className="label">强调色</span>
              <div className="flex gap-2">
                {(
                  [
                    ['indigo', '紫罗兰'],
                    ['teal', '青绿'],
                    ['amber', '琥珀'],
                  ] as ['indigo' | 'teal' | 'amber', string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateSettings({ accentColor: value })}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                      settings.accentColor === value ? 'border-brand text-brand' : 'border-line text-muted'
                    }`}
                    aria-pressed={settings.accentColor === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card card-pad space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-brand" aria-hidden />
                发音
              </h2>
              <button type="button" className="btn-ghost !py-1 !text-xs" onClick={refreshVoices}>
                <RefreshCw className="h-3 w-3" aria-hidden />
                重新检测
              </button>
            </div>
            {!voiceInfo.supported ? (
              <InfoBanner tone="warn" title="这台设备不支持语音合成">
                当前浏览器没有 SpeechSynthesis。若词条自带录音仍可播放；没有录音的词会明确提示不可发音，不会假装播放成功。
              </InfoBanner>
            ) : voiceInfo.us + voiceInfo.uk === 0 ? (
              <InfoBanner tone="warn" title="未检测到英语语音">
                系统里没有安装英语语音包。可在 Windows「设置 → 时间和语言 → 语言」或 macOS「系统设置 →
                辅助功能 → 朗读内容」中安装英语语音后点「重新检测」。若词条带录音，录音仍可正常播放。
              </InfoBanner>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted">美式英语语音</p>
                  <p className="font-semibold tabular-nums">{voiceInfo.us} 个</p>
                </div>
                <div className="rounded-xl bg-surface p-3">
                  <p className="text-xs text-muted">英式英语语音</p>
                  <p className="font-semibold tabular-nums">{voiceInfo.uk} 个</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {(['US', 'UK'] as Accent[]).map((accent) => (
                <button
                  key={accent}
                  type="button"
                  onClick={() => updateSettings({ preferredAccent: accent })}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                    settings.preferredAccent === accent ? 'border-brand text-brand' : 'border-line text-muted'
                  }`}
                  aria-pressed={settings.preferredAccent === accent}
                >
                  {accent === 'US' ? '美式 US' : '英式 UK'}
                </button>
              ))}
              {(['normal', 'slow'] as AudioSpeed[]).map((speed) => (
                <button
                  key={speed}
                  type="button"
                  onClick={() => updateSettings({ audioSpeed: speed })}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                    settings.audioSpeed === speed ? 'border-brand text-brand' : 'border-line text-muted'
                  }`}
                  aria-pressed={settings.audioSpeed === speed}
                >
                  {speed === 'normal' ? '正常语速' : '慢速'}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--brand))]"
                  checked={settings.soundEnabled}
                  onChange={(event) => updateSettings({ soundEnabled: event.target.checked })}
                />
                启用发音
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--brand))]"
                  checked={settings.autoPlayAudio}
                  onChange={(event) => updateSettings({ autoPlayAudio: event.target.checked })}
                />
                翻卡时自动播放（默认关闭，避免突然出声）
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--brand))]"
                  checked={settings.preferRecordedAudio}
                  onChange={(event) => updateSettings({ preferRecordedAudio: event.target.checked })}
                />
                优先播放词条录音，没有录音时使用系统语音
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--brand))]"
                  checked={settings.useOnlineAudio}
                  onChange={(event) => updateSettings({ useOnlineAudio: event.target.checked })}
                />
                允许联网获取真实发音（有道词典音频，失败自动降级）
              </label>
            </div>

            <div className="rounded-xl border border-line p-3">
              <p className="text-xs font-semibold">试听</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !text-xs"
                  onClick={() => void pronunciation.speak('vocabulary')}
                  disabled={pronunciation.speaking}
                  aria-label="试听：正常语速"
                >
                  <Volume2 className="h-3.5 w-3.5" aria-hidden />
                  {pronunciation.speaking ? '播放中…' : '试听正常'}
                </button>
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !text-xs"
                  onClick={() => void pronunciation.speak('vocabulary', { speed: 'slow' })}
                  disabled={pronunciation.speaking}
                  aria-label="试听：慢速"
                >
                  试听慢速
                </button>
                <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={pronunciation.stop}>
                  停止
                </button>
              </div>
              {pronunciation.error ? (
                <p className="mt-2 text-xs text-bad">{pronunciation.error}</p>
              ) : pronunciation.last ? (
                <p className="mt-2 text-xs text-muted">
                  上次播放：{pronunciation.last.source === 'recorded' ? '录音' : '系统语音'}
                  {pronunciation.last.voiceName ? ` · ${pronunciation.last.voiceName}` : ''}
                  {pronunciation.last.voiceLang ? ` (${pronunciation.last.voiceLang})` : ''}
                  {pronunciation.last.usedFallbackVoice ? ' · 已回退到其它英语语音' : ''}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted">尚未播放。点击上方按钮可验证这台设备是否真的出声。</p>
              )}
            </div>

            <p className="text-xs text-muted">
              优先级：词条录音 → 联网词典音频 → 浏览器 SpeechSynthesis → 内置合成。
              联网音频失败不影响学习，会自动降级；voice 计数来自本机实际安装的语音包。
            </p>
          </div>
        </section>
      ) : null}

      {tab === 'data' ? (
        <section className="space-y-4" id="data">
          <div className="card card-pad space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="section-title flex items-center gap-2">
                <HardDriveDownload className="h-4 w-4 text-brand" aria-hidden />
                备份与恢复
              </h2>
              <span className="chip">仅本地</span>
            </div>
            <p className="text-sm text-muted">
              导出包含单词、词书、记忆状态、复习日志、会话、每日统计、徽章与 AI 缓存。恢复前会校验结构与引用关系，失败不会修改现有数据。
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => void downloadBackup()}>
                <Download className="h-4 w-4" aria-hidden />
                导出 JSON 备份
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="h-4 w-4" aria-hidden />
                选择备份文件
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleRestoreFile(file);
              }}
            />
            <div>
              <label className="label" htmlFor="backup-text">
                或粘贴备份 JSON
              </label>
              <textarea
                id="backup-text"
                className="input h-24 font-mono text-xs"
                value={restoreRaw}
                onChange={(event) => {
                  setRestoreRaw(event.target.value);
                  setRestorePreview(null);
                }}
                placeholder='{"meta": {"app": "WordFlow", ... }}'
              />
              <button
                type="button"
                className="btn-secondary mt-2 !text-xs"
                onClick={() => setRestorePreview(validateBackup(restoreRaw))}
                disabled={!restoreRaw.trim()}
              >
                预览校验
              </button>
            </div>

            {restorePreview ? (
              <div className="rounded-xl border border-line p-3 text-sm">
                <p className={restorePreview.ok ? 'font-semibold text-ok' : 'font-semibold text-bad'}>
                  {restorePreview.ok ? '校验通过，可以恢复' : '校验失败，现有数据不会被修改'}
                </p>
                {restorePreview.document ? (
                  <p className="mt-1 text-xs text-muted">
                    单词 {restorePreview.document.words.length} · 词书 {restorePreview.document.decks.length} · 状态{' '}
                    {restorePreview.document.userWordStates.length} · 日志 {restorePreview.document.reviewLogs.length} ·
                    会话 {restorePreview.document.sessions.length} · 导出时间{' '}
                    {formatDateTime(restorePreview.document.meta.exportedAt)}
                  </p>
                ) : null}
                {restorePreview.errors.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-bad">
                    {restorePreview.errors.slice(0, 8).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
                {restorePreview.warnings.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-warn">
                    {restorePreview.warnings.slice(0, 6).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  className="btn-primary mt-3 !text-xs"
                  disabled={!restorePreview.ok}
                  onClick={() => void confirmRestore()}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden />
                  覆盖恢复
                </button>
              </div>
            ) : null}
          </div>

          <div className="card card-pad space-y-3">
            <h2 className="section-title flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-bad" aria-hidden />
              危险操作
            </h2>
            <p className="text-xs text-muted">清空会删除本机全部学习数据，且不可撤销。建议先导出备份。</p>
            <button
              type="button"
              className="btn-danger !text-xs"
              onClick={async () => {
                if (!window.confirm('确认清空全部本地数据？该操作不可撤销。')) return;
                await wipeDatabase();
                await db.delete();
                window.location.reload();
              }}
            >
              清空并重置所有数据
            </button>
          </div>

          <InfoBanner tone="info" title="云同步尚未实现">
            应用内所有「仅本地保存」标记都反映真实状态：没有账号、没有服务端、没有跨设备同步。
          </InfoBanner>
        </section>
      ) : null}

      {tab === 'ai' ? (
        <section className="space-y-4">
          <div className="card card-pad space-y-3">
            <h2 className="section-title flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand" aria-hidden />
              AI 例句与记忆技巧
            </h2>
            <InfoBanner tone={aiService.isConfigured() ? 'ok' : 'warn'} title={aiService.isConfigured() ? '已配置后端代理' : '未配置 AI 服务'}>
              {aiService.isConfigured()
                ? '请求会发送到你部署的服务端代理，前端不保存任何 API Key。'
                : '当前没有可用的 AI 服务，核心学习功能完全正常；缺失内容会显示「待生成」。配置需在部署时通过 VITE_AI_PROXY_URL 指向后端代理。'}
            </InfoBanner>
            <div className="rounded-xl bg-surface p-3 text-xs text-muted">
              <p className="font-semibold text-ink">安全约定</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>API Key 只放在服务端环境变量，不进入前端构建产物</li>
                <li>代理需实现认证、超时（15s）、重试与速率限制</li>
                <li>返回内容需通过 wordId 匹配与长度校验后才写库</li>
              </ul>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className="input"
                placeholder="输入一个本地已有单词，例如 abandon"
                value={aiWord}
                onChange={(event) => setAiWord(event.target.value)}
              />
              <button type="button" className="btn-secondary shrink-0" onClick={() => void testAi()} disabled={aiBusy || !aiWord.trim()}>
                {aiBusy ? '请求中…' : '生成测试'}
              </button>
            </div>
            {aiResult ? <p className="text-xs text-muted">{aiResult}</p> : null}
            <p className="text-xs text-muted">
              已缓存 AI 内容：{(examples as Map<string, AiExamplePayload>).size} 条
            </p>
          </div>
        </section>
      ) : null}

      {tab === 'about' ? (
        <section className="space-y-4">
          <div className="card card-pad space-y-3 text-sm">
            <h2 className="section-title">关于 WordFlow</h2>
            <p className="text-muted">
              WordFlow 是一个本地优先的英语背单词应用。调度器为 FSRS-4.5 兼容的自实现版本
              （<code className="rounded bg-surface px-1">wf-fsrs-4.5-lite</code>），使用公开默认权重，
              只映射「认识/模糊/忘记」三档，未用真实复习历史校准，不是官方 FSRS 库。
            </p>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted">算法版本</dt>
                <dd className="font-mono text-xs">{storedSummary.algorithmConfig.version}</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted">目标保持率</dt>
                <dd className="text-xs">{Math.round(storedSummary.algorithmConfig.desiredRetention * 100)}%</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted">数据结构版本</dt>
                <dd className="text-xs">schema {storedSummary.schemaVersion}</dd>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <dt className="text-xs text-muted">当前用户</dt>
                <dd className="text-xs">local-user（未登录）</dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn-secondary !text-xs"
              onClick={() => {
                resetSettings();
                pushToast({ kind: 'info', title: '设置已重置', description: '学习数据不会被删除。' });
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              重置为默认设置
            </button>
          </div>

          <div className="card card-pad space-y-2 text-sm">
            <h2 className="section-title flex items-center gap-2">
              <Keyboard className="h-4 w-4" aria-hidden />
              键盘快捷键
            </h2>
            <ul className="space-y-1 text-muted">
              <li><kbd className="rounded bg-surface px-1.5">空格</kbd> / <kbd className="rounded bg-surface px-1.5">Enter</kbd> 显示答案</li>
              <li><kbd className="rounded bg-surface px-1.5">1</kbd> 认识 · <kbd className="rounded bg-surface px-1.5">2</kbd> 模糊 · <kbd className="rounded bg-surface px-1.5">3</kbd> 忘记</li>
              <li><kbd className="rounded bg-surface px-1.5">S</kbd> 播放发音</li>
            </ul>
          </div>

          <InfoBanner tone="info">
            默认设置：新词 {DEFAULT_SETTINGS.dailyNewLimit}/天、复习 {DEFAULT_SETTINGS.dailyReviewLimit}/天、
            目标 {DEFAULT_SETTINGS.dailyGoalCount} 词。当前值可在「学习」标签调整。
          </InfoBanner>
        </section>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-muted">
        <Save className="h-3.5 w-3.5" aria-hidden />
        设置修改后立即保存到 localStorage。
        <Link className="link" to="/">
          返回首页
        </Link>
      </div>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  hint,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  hint?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="input"
        min={min}
        max={max}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.round(next))));
        }}
      />
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

void Spinner;
