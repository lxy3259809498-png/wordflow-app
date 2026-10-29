import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CheckCircle2, Gauge, RefreshCw, Volume2, XCircle } from 'lucide-react';
import { db } from '@/lib/db/db';
import { PageHeader, InfoBanner, Spinner } from '@/components/ui';
import { useApp } from '@/providers/appContext';
import { usePronunciation } from '@/hooks/usePronunciation';
import { getPronunciationService, type SpeakResult } from '@/lib/audio/pronunciationService';
import type { Accent, AudioSpeed } from '@/lib/types';

/**
 * Pronunciation test bench. Everything shown here is measured, not assumed:
 * voice counts, which voice was used, whether audio or TTS played, and the real
 * error text when playback failed.
 */
export default function Pronunciation() {
  const { settings, updateSettings } = useApp();
  const pronunciation = usePronunciation();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accent, setAccent] = useState<Accent>(settings.preferredAccent);
  const [speed, setSpeed] = useState<AudioSpeed>('normal');
  const [forceTts, setForceTts] = useState(false);
  const [history, setHistory] = useState<{ at: number; result: SpeakResult }[]>([]);

  const words = useLiveQuery(async () => {
    const all = await db.words.toArray();
    return all.slice(0, 400);
  }, []);

  const filtered = useMemo(() => {
    if (!words) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? words.filter((word) => word.term.toLowerCase().includes(q) || word.definitions[0]?.includes(query))
      : words;
    return list.slice(0, 60);
  }, [query, words]);

  const selected = useMemo(
    () => words?.find((word) => word.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId, words],
  );

  const env = getPronunciationService().describeEnvironment();

  const play = async () => {
    if (!selected) return;
    const result = await pronunciation.speak(selected, { accent, speed });
    if (result) {
      setHistory((current) => [{ at: Date.now(), result }, ...current].slice(0, 8));
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="发音测试"
        subtitle="真实检测这台设备能否发声：显示实际使用的语音、音频或 TTS 来源，以及失败原因。"
        actions={
          <button type="button" className="btn-secondary" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            重新检测
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Metric
          label="语音合成支持"
          value={env.speechSupported ? '支持' : '不支持'}
          ok={env.speechSupported}
        />
        <Metric label="语音列表" value={env.voicesLoaded ? `已加载 ${env.voiceCount}` : '未加载'} ok={env.voicesLoaded} />
        <Metric label="美音 voice" value={`${env.usCount} 个`} ok={env.usCount > 0} />
        <Metric label="英音 voice" value={`${env.ukCount} 个`} ok={env.ukCount > 0} />
      </div>

      {!env.speechSupported ? (
        <InfoBanner tone="warn" title="此浏览器没有 SpeechSynthesis">
          若词条自带录音仍可播放；没有录音的词会明确提示不可发音。
        </InfoBanner>
      ) : !env.voicesLoaded ? (
        <InfoBanner tone="warn" title="语音列表尚未加载">
          Chrome 首次调用 getVoices() 常返回空数组，需等待 voiceschanged 事件。点「重新检测」或在设置页稍候。
        </InfoBanner>
      ) : env.usCount + env.ukCount === 0 ? (
        <InfoBanner tone="warn" title="没有英语语音包">
          系统缺少 en-US / en-GB 语音。应用会自动改用<strong>内置合成发音</strong>（能出声但音质不如系统语音）。
          想要更自然的声音，可在 Windows：设置 → 时间和语言 → 语言 → 添加英语；macOS：系统设置 → 辅助功能 → 朗读内容 → 系统声音。
        </InfoBanner>
      ) : null}

      <section className="card card-pad space-y-3">
        <h2 className="section-title">选择词条</h2>
        <input
          className="input"
          placeholder="搜索单词或中文释义"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索词条"
        />
        {!words ? (
          <Spinner label="读取词库…" />
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted">没有匹配的词条。</p>
        ) : (
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto">
            {filtered.map((word) => (
              <button
                key={word.id}
                type="button"
                onClick={() => setSelectedId(word.id)}
                aria-pressed={selected?.id === word.id}
                className={`rounded-lg border px-2 py-1 text-xs ${
                  selected?.id === word.id
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line text-muted hover:text-ink'
                }`}
              >
                {word.term}
                {word.audioUS || word.audioUK ? (
                  <span className="ml-1 text-[9px] text-ok">录音</span>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card card-pad space-y-3">
        <h2 className="section-title">播放参数</h2>
        <div className="flex flex-wrap items-center gap-2">
          {(['US', 'UK'] as Accent[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setAccent(value)}
              aria-pressed={accent === value}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                accent === value ? 'border-brand text-brand' : 'border-line text-muted'
              }`}
            >
              {value === 'US' ? '美音 US' : '英音 UK'}
            </button>
          ))}
          {(['normal', 'slow'] as AudioSpeed[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSpeed(value)}
              aria-pressed={speed === value}
              className={`rounded-xl border px-3 py-1.5 text-xs font-medium ${
                speed === value ? 'border-brand text-brand' : 'border-line text-muted'
              }`}
            >
              {value === 'normal' ? '正常' : '慢速'}
            </button>
          ))}
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--brand))]"
              checked={forceTts}
              onChange={(event) => {
                setForceTts(event.target.checked);
                updateSettings({ preferRecordedAudio: !event.target.checked });
              }}
            />
            强制使用 TTS（忽略录音）
          </label>
        </div>

        {selected ? (
          <div className="rounded-xl bg-surface p-3">
            <p className="text-sm font-semibold">
              {selected.term}
              <span className="ml-2 font-mono text-xs font-normal text-muted">
                US {selected.phoneticUS || selected.phonetic || '—'} / UK{' '}
                {selected.phoneticUK || selected.phonetic || '—'}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted">{selected.definitions.join('；')}</p>
            <p className="mt-1 text-[11px] text-muted">
              录音：US {selected.audioUS ? '有' : '无'} · UK {selected.audioUK ? '有' : '无'}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void play()}
            disabled={!selected || pronunciation.speaking}
          >
            <Volume2 className="h-4 w-4" aria-hidden />
            {pronunciation.speaking ? '播放中…' : `播放（${accent}${speed === 'slow' ? ' · 慢速' : ''}）`}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => selected && void pronunciation.speak(selected, { accent, speed: 'slow' })}
            disabled={!selected || pronunciation.speaking}
          >
            <Gauge className="h-4 w-4" aria-hidden />
            慢速播放
          </button>
          <button type="button" className="btn-ghost" onClick={pronunciation.stop}>
            停止
          </button>
        </div>

        {pronunciation.error ? (
          <div className="flex gap-2 rounded-lg border border-bad/40 bg-bad/10 p-3 text-xs text-bad">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            <span>{pronunciation.error}</span>
          </div>
        ) : pronunciation.last ? (
          <div className="flex gap-2 rounded-lg border border-ok/40 bg-ok/10 p-3 text-xs text-ok">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              已播放 · 来源{' '}
              {pronunciation.last.source === 'recorded'
                ? '录音'
                : pronunciation.last.source === 'synth'
                  ? '内置合成（音质有限）'
                  : pronunciation.last.source === 'online'
                    ? '联网词典音频'
                    : '系统语音'}
              {pronunciation.last.voiceName ? ` · ${pronunciation.last.voiceName}` : ''}
              {pronunciation.last.voiceLang ? ` (${pronunciation.last.voiceLang})` : ''}
              {pronunciation.last.usedFallbackVoice ? ' · 已回退到其它英语语音' : ''}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted">尚未播放。点击上方按钮验证是否真的出声。</p>
        )}
      </section>

      {history.length > 0 ? (
        <section className="card card-pad space-y-2">
          <h2 className="section-title">最近结果</h2>
          <ul className="divide-y divide-line/70 text-xs">
            {history.map((entry, index) => (
              <li key={`${entry.at}-${index}`} className="flex items-start gap-2 py-1.5">
                {entry.result.ok ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" aria-hidden />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bad" aria-hidden />
                )}
                <span className="text-muted">
                  {new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false })} ·{' '}
                  {entry.result.ok
                    ? `${
                        entry.result.source === 'recorded'
                          ? '录音'
                          : entry.result.source === 'online'
                            ? '联网音频'
                            : entry.result.source === 'synth'
                              ? '内置合成'
                              : 'TTS'
                      } · ${entry.result.voiceName ?? ''}`
                    : `${entry.result.code} · ${entry.result.reason}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <InfoBanner tone="info">
        移动端 Safari 需要用户手势后才能发声；桌面 Chrome 首次语音列表可能为空，需等待 voiceschanged。
        本页的结果来自实际播放，不代表其它设备。
      </InfoBanner>
    </div>
  );
}

function Metric({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="card p-3">
      <p className="text-[11px] text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${ok ? 'text-ok' : 'text-warn'}`}>{value}</p>
    </div>
  );
}
