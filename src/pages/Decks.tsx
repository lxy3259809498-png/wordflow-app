import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FileUp,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { db } from '@/lib/db/db';
import {
  applyImport,
  createCustomDeck,
  deleteDeck,
  listImportBatches,
  undoImport,
} from '@/lib/data/repository';
import { parseWordCsv, parseWordJson, wordsToCsv, type ImportPreview } from '@/lib/import/wordImport';
import { PageHeader, ProgressBar, Spinner, InfoBanner, EmptyState } from '@/components/ui';
import { useApp } from '@/providers/appContext';
import { formatDateTime } from '@/lib/time';
import { EXAM_OPTIONS, examLabel, VOCABULARY_RELEASE } from '@/lib/decks/labels';
import { DECK_CATALOG } from '@/lib/decks/catalog';
import { computeDeckOverviews } from '@/lib/decks/stats';
import type { ExamType } from '@/lib/types';

type SortKey = 'default' | 'size' | 'progress' | 'quality';

export default function Decks() {
  const { settings, updateSettings, pushToast } = useApp();
  const [importDeckId, setImportDeckId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [detailDeckId, setDetailDeckId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ExamType | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const fileInput = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const data = useLiveQuery(async () => {
    const [decks, words, deckWords, states, batches] = await Promise.all([
      db.decks.toArray(),
      db.words.toArray(),
      db.deckWords.toArray(),
      db.userWordStates.toArray(),
      listImportBatches(db),
    ]);
    return { decks, words, deckWords, states, batches };
  }, []);

  const overviews = useMemo(() => {
    if (!data) return [];
    const now = Date.now();
    return computeDeckOverviews({
      decks: data.decks,
      words: data.words,
      deckWords: data.deckWords,
      states: data.states,
      now,
    });
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    const deckById = new Map(data.decks.map((deck) => [deck.id, deck]));
    const list = overviews
      .map((overview) => ({ overview, deck: deckById.get(overview.deckId)! }))
      .filter((row) => Boolean(row.deck))
      .filter((row) => {
        if (categoryFilter !== 'all' && row.deck.examType !== categoryFilter) return false;
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          row.deck.name.toLowerCase().includes(q) ||
          row.deck.description.toLowerCase().includes(q) ||
          row.deck.source.toLowerCase().includes(q)
        );
      });

    const sorted = [...list];
    if (sortKey === 'size') sorted.sort((a, b) => b.overview.total - a.overview.total);
    if (sortKey === 'progress') {
      sorted.sort((a, b) => {
        const pa = a.overview.total === 0 ? 0 : a.overview.learned / a.overview.total;
        const pb = b.overview.total === 0 ? 0 : b.overview.learned / b.overview.total;
        return pb - pa;
      });
    }
    if (sortKey === 'quality') {
      sorted.sort((a, b) => a.overview.missingAudio - b.overview.missingAudio);
    }
    return sorted;
  }, [categoryFilter, data, overviews, query, sortKey]);

  // Catalogue categories that currently have no real deck behind them.
  const missingCategories = useMemo(() => {
    const present = new Set(data?.decks.map((deck) => deck.examType));
    return DECK_CATALOG.filter(
      (entry) => entry.key !== 'custom' && !present.has(entry.key as ExamType),
    );
  }, [data]);

  const selectedDeckIds = settings.selectedDeckIds;
  const toggleDeck = (deckId: string) => {
    const next = selectedDeckIds.includes(deckId)
      ? selectedDeckIds.filter((id) => id !== deckId)
      : [...selectedDeckIds, deckId];
    updateSettings({ selectedDeckIds: next });
  };

  const openPicker = (deckId: string) => {
    setImportDeckId(deckId);
    if (fileInput.current) {
      fileInput.current.value = '';
      fileInput.current.click();
    }
  };

  const handleFile = async (file: File, deckId: string) => {
    setImportError(null);
    setPreview(null);
    setPendingFile(file);
    setImportDeckId(deckId);
    try {
      const text = await file.text();
      const existing = new Set((await db.words.toArray()).map((w) => w.normalizedTerm));
      const trimmed = text.trim();
      const isJson =
        file.name.toLowerCase().endsWith('.json') ||
        trimmed.startsWith('{') ||
        trimmed.startsWith('[');
      const parsed = isJson
        ? parseWordJson(text, { existingTerms: existing, sourceLabel: file.name })
        : parseWordCsv(text, { existingTerms: existing, sourceLabel: file.name });
      const deck = data?.decks.find((d) => d.id === deckId);
      setPreview({
        format: isJson ? 'json' : 'csv',
        deck: { name: deck?.name ?? '', examType: deck?.examType ?? 'custom' },
        rows: parsed.rows,
        errors: parsed.errors,
        duplicates: parsed.duplicates,
        totalRows: parsed.totalRows,
      });
      if (parsed.rows.length === 0) {
        setImportError('没有可导入的有效行，请检查文件格式或字段名。');
      }
    } catch (error) {
      setImportError(`读取文件失败：${(error as Error).message}`);
    }
  };

  const confirmImport = async () => {
    if (!preview || !importDeckId || preview.rows.length === 0) return;
    setApplying(true);
    setProgress({ done: 0, total: preview.rows.length });
    try {
      const result = await applyImport({
        deckId: importDeckId,
        rows: preview.rows,
        fileName: pendingFile?.name ?? 'pasted',
        now: Date.now(),
        onProgress: setProgress,
      });
      pushToast({
        kind: 'success',
        title: '导入完成',
        description: `新增 ${result.createdWords} 个词条，复用已有 ${result.reusedWords} 个，关联 ${result.linkedWords} 条，跳过重复 ${result.skipped} 条。`,
      });
      setPreview(null);
      setPendingFile(null);
    } catch (error) {
      pushToast({ kind: 'error', title: '导入失败', description: (error as Error).message });
    } finally {
      setApplying(false);
      setProgress(null);
    }
  };

  const handleUndo = async (batchId: string) => {
    if (!window.confirm('撤销会删除该批次导入的单词与关联（若已有学习记录会拒绝执行）。继续？')) return;
    const result = await undoImport(batchId, Date.now());
    pushToast({
      kind: result.ok ? 'success' : 'error',
      title: result.ok ? '已撤销导入' : '撤销被拒绝',
      description: result.message,
    });
  };

  const handleDeleteDeck = async (deckId: string, deckName: string) => {
    if (
      !window.confirm(
        `删除「${deckName}」？未学习过的词条会被清理，已学过的词会保留记忆记录；演示词书不会被自动加回。`,
      )
    ) {
      return;
    }
    const result = await deleteDeck(deckId, Date.now());
    pushToast({
      kind: result.ok ? 'success' : 'error',
      title: result.ok ? '词书已删除' : '删除失败',
      description: result.message,
    });
    if (result.ok && selectedDeckIds.includes(deckId)) {
      updateSettings({ selectedDeckIds: selectedDeckIds.filter((id) => id !== deckId) });
    }
  };

  const exportDeckCsv = (deckId: string) => {
    if (!data) return;
    const ids = new Set(
      data.deckWords.filter((link) => link.deckId === deckId).map((link) => link.wordId),
    );
    const words = data.words.filter((word) => ids.has(word.id));
    const csv = wordsToCsv(words);
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wordflow-${deckId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!data) return <Spinner label="正在读取词书…" />;

  const detailWords = detailDeckId
    ? (() => {
        const ids = new Set(
          data.deckWords.filter((link) => link.deckId === detailDeckId).map((link) => link.wordId),
        );
        return data.words.filter((word) => ids.has(word.id));
      })()
    : [];

  const totalWords = data.words.length;
  const totalMissingAudio = overviews.reduce((sum, o) => sum + o.missingAudio, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title="词书中心"
        subtitle={`共 ${data.decks.length} 本词书 · ${totalWords} 个词条 · 演示词库版本 ${VOCABULARY_RELEASE}。分类目录覆盖 10 类，没有数据的分类会明确标注「尚未导入」。`}
        actions={
          <div className="flex gap-2">
            <Link to="/pronunciation" className="btn-secondary">
              <Upload className="h-4 w-4 rotate-180" aria-hidden />
              发音测试
            </Link>
            <button type="button" className="btn-secondary" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              新建词书
            </button>
          </div>
        }
      />

      <InfoBanner tone="warn" title="关于词库来源">
        WordFlow 只内置原创手写演示词条，<strong>不包含也不声称拥有</strong>任何官方 CET-4 / CET-6 / 考研 / 雅思 / 托福 / GRE
        商业词库。需要完整词库时请导入你有权使用的词表（见下方模板与说明）。
      </InfoBanner>

      <div className="card card-pad space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              className="input pl-9"
              placeholder="搜索词书名称、描述或来源"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="搜索词书"
            />
            {query ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
                onClick={() => setQuery('')}
                aria-label="清空搜索"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            ) : null}
          </label>
          <select
            className="input !w-auto text-xs"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as ExamType | 'all')}
            aria-label="按分类筛选"
          >
            <option value="all">全部分类</option>
            {EXAM_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="input !w-auto text-xs"
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            aria-label="排序方式"
          >
            <option value="default">默认顺序</option>
            <option value="size">词数最多</option>
            <option value="progress">进度最高</option>
            <option value="quality">缺音频最少</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>
            显示 {rows.length} / {data.decks.length} 本
          </span>
          <span aria-hidden>·</span>
          <span>总词条 {totalWords}</span>
          <span aria-hidden>·</span>
          <span className={totalMissingAudio > 0 ? 'text-warn' : ''}>
            缺录音 {totalMissingAudio} 个（将使用系统语音）
          </span>
          {selectedDeckIds.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>学习中 {selectedDeckIds.length} 本</span>
              <button
                type="button"
                className="link text-xs"
                onClick={() => updateSettings({ selectedDeckIds: [] })}
              >
                改为全部
              </button>
            </>
          ) : null}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-5 w-5" />}
          title={data.decks.length === 0 ? '还没有词书' : '没有符合条件的词书'}
          description={
            data.decks.length === 0
              ? '创建一个自定义词书，然后导入 CSV 或 JSON 单词表。'
              : '换个搜索词或分类试试。'
          }
          action={
            <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
              新建词书
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ deck, overview }) => {
            const active = selectedDeckIds.length === 0 || selectedDeckIds.includes(deck.id);
            const percent =
              overview.total === 0 ? 0 : Math.round((overview.learned / overview.total) * 100);
            return (
              <article
                key={deck.id}
                className={`card card-pad space-y-3 ${active ? '' : 'opacity-60'}`}
                data-testid={`deck-card-${deck.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-semibold">{deck.name}</h2>
                      <span className="chip text-[10px]">{examLabel(deck.examType)}</span>
                      {deck.isDemo ? <span className="chip text-[10px]">演示</span> : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{deck.description}</p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-muted">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[rgb(var(--brand))]"
                      checked={active}
                      onChange={() => toggleDeck(deck.id)}
                      aria-label={`学习时包含 ${deck.name}`}
                    />
                    参与
                  </label>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-surface py-1.5">
                    <dt className="text-[10px] text-muted">总词数</dt>
                    <dd className="text-sm font-semibold tabular-nums">{overview.total}</dd>
                  </div>
                  <div className="rounded-lg bg-surface py-1.5">
                    <dt className="text-[10px] text-muted">已学习</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {overview.learned}
                      <span className="ml-1 text-[10px] font-normal text-muted">
                        待学 {overview.unlearned}
                      </span>
                    </dd>
                  </div>
                  <div className="rounded-lg bg-surface py-1.5">
                    <dt className="text-[10px] text-muted">已掌握</dt>
                    <dd className="text-sm font-semibold tabular-nums">{overview.mastered}</dd>
                  </div>
                </dl>

                <ProgressBar value={overview.learned} max={Math.max(1, overview.total)} label={`学习进度 ${percent}%`} />

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className={`chip ${overview.missingAudio > 0 ? 'border-warn/40 text-warn' : 'border-ok/40 text-ok'}`}>
                    缺录音 {overview.missingAudio}
                  </span>
                  <span className={`chip ${overview.missingPhonetic > 0 ? 'border-warn/40 text-warn' : 'border-ok/40 text-ok'}`}>
                    缺音标 {overview.missingPhonetic}
                  </span>
                  <span className={`chip ${overview.missingDefinition > 0 ? 'border-bad/40 text-bad' : 'border-ok/40 text-ok'}`}>
                    缺释义 {overview.missingDefinition}
                  </span>
                  <span className={`chip ${overview.missingExample > 0 ? 'border-line' : 'border-ok/40 text-ok'}`}>
                    缺例句 {overview.missingExample}
                  </span>
                  {overview.dueNow > 0 ? <span className="chip-brand">到期 {overview.dueNow}</span> : null}
                </div>

                <p className="text-[11px] leading-relaxed text-muted">
                  来源：{deck.source} · 授权：{deck.licenseNote}
                  {overview.importedAt ? ` · 更新 ${formatDateTime(overview.importedAt)}` : ''}
                </p>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary !py-1.5 !text-xs"
                    onClick={() => openPicker(deck.id)}
                    aria-label={`导入到 ${deck.name}`}
                  >
                    <FileUp className="h-3.5 w-3.5" aria-hidden />
                    导入
                  </button>
                  <button
                    type="button"
                    className="btn-secondary !py-1.5 !text-xs"
                    onClick={() => exportDeckCsv(deck.id)}
                    disabled={overview.total === 0}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    导出 CSV
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !text-xs"
                    onClick={() => setDetailDeckId(detailDeckId === deck.id ? null : deck.id)}
                  >
                    {detailDeckId === deck.id ? '收起' : '查看单词'}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost !py-1.5 !text-xs text-bad hover:text-bad"
                    onClick={() => void handleDeleteDeck(deck.id, deck.name)}
                    aria-label={`删除词书 ${deck.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    删除
                  </button>
                </div>

                {detailDeckId === deck.id ? (
                  <ul className="max-h-72 divide-y divide-line/70 overflow-auto rounded-lg border border-line/70">
                    {detailWords.length === 0 ? (
                      <li className="px-3 py-2 text-xs text-muted">该词书还没有单词。</li>
                    ) : (
                      detailWords.slice(0, 100).map((word) => (
                        <li key={word.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="font-medium">{word.term}</span>
                            <span className="font-mono text-[10px] text-muted">
                              {word.phoneticUS || word.phonetic || '无音标'}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs text-muted">{word.definitions[0]}</span>
                            {word.audioUS || word.audioUK ? (
                              <span className="chip text-[9px] text-ok">录音</span>
                            ) : (
                              <span className="chip text-[9px]">TTS</span>
                            )}
                          </span>
                        </li>
                      ))
                    )}
                    {detailWords.length > 100 ? (
                      <li className="px-3 py-2 text-[11px] text-muted">
                        仅显示前 100 个，共 {detailWords.length} 个。
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {missingCategories.length > 0 ? (
        <section className="card card-pad space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">尚未导入的分类</h2>
            <span className="text-xs text-muted">{missingCategories.length} 类</span>
          </div>
          <p className="text-xs text-muted">
            这些分类还没有真实数据，因此不显示任何词数。导入你自己有权使用的词表后，它们会自动出现在上方的词书列表中。
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {missingCategories.map((entry) => (
              <li key={entry.key} className="rounded-xl border border-dashed border-line p-3">
                <p className="text-sm font-medium">{entry.name}</p>
                <p className="mt-0.5 text-xs text-muted">{entry.description}</p>
                <p className="mt-1 text-[11px] text-muted">{entry.suggestedSource}</p>
                <button
                  type="button"
                  className="btn-ghost mt-2 !px-0 !py-1 !text-xs text-brand hover:text-brand"
                  onClick={() => setShowCreate(true)}
                >
                  新建该类词书
                  <ChevronRight className="h-3 w-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card card-pad space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="section-title">导入记录</h2>
          <span className="text-xs text-muted">撤销只删除本批次新建且未学习的词</span>
        </div>
        {data.batches.length === 0 ? (
          <p className="text-sm text-muted">还没有导入记录。</p>
        ) : (
          <ul className="divide-y divide-line/70">
            {data.batches.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{batch.fileName}</p>
                  <p className="text-xs text-muted">
                    {formatDateTime(batch.createdAt)} · 新增 {batch.createdWordIds.length} 词 · 关联{' '}
                    {batch.createdDeckWordIds.length} 条
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-ghost !py-1.5 !text-xs text-bad hover:text-bad"
                  onClick={() => void handleUndo(batch.id)}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                  撤销
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card card-pad space-y-2 text-sm">
        <h2 className="section-title">导入格式</h2>
        <p className="text-muted">CSV 表头（顺序可变，缺失列按空处理）：</p>
        <pre className="overflow-x-auto rounded-lg bg-surface p-2.5 text-[11px] leading-relaxed text-muted">
{`term,phoneticUS,phoneticUK,partOfSpeech,definitions,translations,exampleEn,exampleZh,audioUS,audioUK,tags,source,licenseNote`}
        </pre>
        <p className="text-muted">
          JSON 为数组或 <code className="break-all rounded bg-surface px-1">{'{ "words": [...] }'}</code>，字段同上，
          <code className="rounded bg-surface px-1">definitions</code>/<code className="rounded bg-surface px-1">translations</code>
          为数组，<code className="rounded bg-surface px-1">examples</code> 为 <code className="rounded bg-surface px-1">{'{en, zh}'}</code> 数组。
        </p>
        <p className="text-muted">
          释义用分号分隔；<code className="rounded bg-surface px-1">audioUS/audioUK</code> 只接受 http(s) URL 或
          <code className="rounded bg-surface px-1">/</code> 开头的站内路径，其它值会被忽略（不会构造假 URL）。大文件按每批 200 行写入并显示进度。
        </p>
        <a className="link text-sm" href={`${import.meta.env.BASE_URL}wordflow-sample.csv`} download>
          下载示例 CSV 模板
        </a>
        <span className="mx-2 text-muted">·</span>
        <a className="link text-sm" href={`${import.meta.env.BASE_URL}wordflow-sample.json`} download>
          下载示例 JSON 模板
        </a>
      </section>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && importDeckId) void handleFile(file, importDeckId);
        }}
      />

      {preview ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="导入预览"
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-auto rounded-t-2xl bg-raised p-5 shadow-lift sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">导入预览 · {preview.deck.name}</h2>
                <p className="text-xs text-muted">
                  格式 {preview.format.toUpperCase()} · 共 {preview.totalRows} 行 · 有效 {preview.rows.length} 行
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost !px-2 !py-1"
                onClick={() => setPreview(null)}
                aria-label="关闭预览"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {importError ? (
              <div className="mt-3 flex gap-2 rounded-lg border border-bad/40 bg-bad/10 p-3 text-xs text-bad">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                {importError}
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-ok/10 py-2 text-ok">
                <p className="text-lg font-semibold tabular-nums">{preview.rows.length}</p>
                <p className="text-[10px]">可导入</p>
              </div>
              <div className="rounded-lg bg-bad/10 py-2 text-bad">
                <p className="text-lg font-semibold tabular-nums">{preview.errors.length}</p>
                <p className="text-[10px]">错误行</p>
              </div>
              <div className="rounded-lg bg-warn/10 py-2 text-warn">
                <p className="text-lg font-semibold tabular-nums">{preview.duplicates.length}</p>
                <p className="text-[10px]">重复词</p>
              </div>
            </div>

            {preview.errors.length > 0 ? (
              <div className="mt-3 max-h-40 overflow-auto rounded-lg border border-bad/30">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bad/10 text-bad">
                    <tr>
                      <th className="px-2 py-1.5">行</th>
                      <th className="px-2 py-1.5">单词</th>
                      <th className="px-2 py-1.5">问题</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((error, index) => (
                      <tr key={`${error.line}-${index}`} className="border-t border-line/70">
                        <td className="px-2 py-1 tabular-nums">{error.line}</td>
                        <td className="px-2 py-1">{error.term || '—'}</td>
                        <td className="px-2 py-1 text-muted">{error.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {preview.duplicates.length > 0 ? (
              <p className="mt-2 text-xs text-muted">
                重复词将被跳过：{preview.duplicates.slice(0, 12).map((d) => d.term).join('、')}
                {preview.duplicates.length > 12 ? ' …' : ''}
              </p>
            ) : null}

            <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-line/70">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface text-muted">
                  <tr>
                    <th className="px-2 py-1.5">单词</th>
                    <th className="px-2 py-1.5">音标</th>
                    <th className="px-2 py-1.5">词性</th>
                    <th className="px-2 py-1.5">释义</th>
                    <th className="px-2 py-1.5">音频</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 40).map((row) => (
                    <tr key={row.term} className="border-t border-line/70">
                      <td className="px-2 py-1 font-medium">{row.term}</td>
                      <td className="px-2 py-1 font-mono text-muted">{row.phoneticUS || '—'}</td>
                      <td className="px-2 py-1 text-muted">{row.partOfSpeech || '—'}</td>
                      <td className="px-2 py-1">{row.definitions.join('；')}</td>
                      <td className="px-2 py-1 text-muted">
                        {row.audioUS || row.audioUK ? '有' : 'TTS'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {progress ? (
              <div className="mt-3">
                <ProgressBar
                  value={progress.done}
                  max={Math.max(1, progress.total)}
                  label={`写入中 ${progress.done} / ${progress.total}`}
                />
              </div>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setPreview(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void confirmImport()}
                disabled={applying || preview.rows.length === 0}
              >
                <Check className="h-4 w-4" aria-hidden />
                {applying ? '导入中…' : `确认导入 ${preview.rows.length} 词`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <CreateDeckDialog
          onClose={() => setShowCreate(false)}
          onCreate={async (input) => {
            const deck = await createCustomDeck(input, Date.now());
            setShowCreate(false);
            pushToast({
              kind: 'success',
              title: '词书已创建',
              description: `可以给「${deck.name}」导入词表了。`,
            });
          }}
        />
      ) : null}

      <InfoBanner tone="ok">
        一个单词可以属于多本词书，但个人记忆状态按 wordId 唯一，只保留一份；导入永不覆盖已有复习计划。
      </InfoBanner>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <Upload className="h-3.5 w-3.5" aria-hidden />
        导入前会先预览有效行、错误行和重复词，确认后才写入数据库。
      </div>
    </div>
  );
}

function CreateDeckDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    examType: ExamType;
    description: string;
    source: string;
    licenseNote: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [examType, setExamType] = useState<ExamType>('custom');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [licenseNote, setLicenseNote] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="新建词书"
    >
      <form
        className="w-full max-w-md space-y-3 rounded-t-2xl bg-raised p-5 shadow-lift sm:rounded-2xl"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          await onCreate({
            name,
            examType,
            description: description || '自定义词书',
            source: source || '用户自建',
            licenseNote: licenseNote || '请填写真实来源与授权说明',
          });
          setBusy(false);
        }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">新建词书</h2>
          <button type="button" className="btn-ghost !px-2 !py-1" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div>
          <label className="label" htmlFor="deck-name">
            词书名称
          </label>
          <input
            id="deck-name"
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：我的六级高频词"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="label" htmlFor="deck-type">
            分类
          </label>
          <select
            id="deck-type"
            className="input"
            value={examType}
            onChange={(event) => setExamType(event.target.value as ExamType)}
          >
            {EXAM_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="deck-desc">
            描述
          </label>
          <input
            id="deck-desc"
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="一句话说明用途"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="deck-source">
              来源
            </label>
            <input
              id="deck-source"
              className="input"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="例如：自建 / 学校讲义"
            />
          </div>
          <div>
            <label className="label" htmlFor="deck-license">
              授权说明
            </label>
            <input
              id="deck-license"
              className="input"
              value={licenseNote}
              onChange={(event) => setLicenseNote(event.target.value)}
              placeholder="例如：CC BY 4.0"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn-primary" disabled={busy || !name.trim()}>
            {busy ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </div>
  );
}
