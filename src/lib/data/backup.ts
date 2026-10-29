import type { AiExamplePayload } from '@/lib/types';

export interface DocumentMeta {
  app: 'WordFlow';
  schemaVersion: number;
  exportedAt: number;
  /** Placeholder for the future cloud account id; `local-user` in phase 1. */
  userId: string;
  counts: Record<string, number>;
}

/** Every table is a plain row list so validation can work on unknown input. */
export type BackupRow = Record<string, unknown>;

export interface BackupTables {
  words: BackupRow[];
  decks: BackupRow[];
  deckWords: BackupRow[];
  userWordStates: BackupRow[];
  reviewLogs: BackupRow[];
  sessions: BackupRow[];
  dailyStats: BackupRow[];
  achievements: BackupRow[];
  aiExamples: BackupRow[];
  importBatches: BackupRow[];
}

export interface BackupDocument extends BackupTables {
  meta: DocumentMeta;
}

export const BACKUP_SCHEMA_VERSION = 1;
export const LOCAL_USER_ID = 'local-user';

export function buildBackup(tables: BackupTables, exportedAt: number): BackupDocument {
  const counts = Object.fromEntries(
    Object.entries(tables).map(([key, rows]) => [key, rows.length]),
  );
  return {
    meta: {
      app: 'WordFlow',
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt,
      userId: LOCAL_USER_ID,
      counts,
    },
    ...tables,
  };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  document?: BackupDocument;
}

const REQUIRED_TABLES = [
  'words',
  'decks',
  'deckWords',
  'userWordStates',
  'reviewLogs',
  'sessions',
  'dailyStats',
  'achievements',
] as const;

const OPTIONAL_TABLES = ['aiExamples', 'importBatches'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasString = (row: Record<string, unknown>, key: string): boolean =>
  typeof row[key] === 'string' && (row[key] as string).length > 0;

const hasNumber = (row: Record<string, unknown>, key: string): boolean =>
  typeof row[key] === 'number' && Number.isFinite(row[key]);

/**
 * Full validation before touching IndexedDB: a corrupt file must leave the
 * existing database byte-for-byte intact.
 */
export function validateBackup(raw: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { ok: false, errors: [`JSON 解析失败：${(error as Error).message}`], warnings };
  }
  if (!isRecord(parsed)) return { ok: false, errors: ['备份文件顶层必须是对象'], warnings };
  const meta = parsed.meta;
  if (!isRecord(meta)) return { ok: false, errors: ['缺少 meta 元信息'], warnings };
  if (meta.app !== 'WordFlow') errors.push('meta.app 不是 WordFlow，可能不是本应用导出的文件');
  if (meta.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    warnings.push(
      `备份版本 ${String(meta.schemaVersion)} 与当前版本 ${BACKUP_SCHEMA_VERSION} 不同，将按当前结构导入`,
    );
  }
  if (!hasNumber(meta, 'exportedAt')) warnings.push('缺少导出时间');

  const tables: Record<string, BackupRow[]> = {};
  for (const table of REQUIRED_TABLES) {
    const value = parsed[table];
    if (!Array.isArray(value)) {
      errors.push(`缺少数据表 ${table}`);
      continue;
    }
    if (!value.every(isRecord)) {
      errors.push(`数据表 ${table} 含非法条目`);
      continue;
    }
    tables[table] = value as BackupRow[];
  }
  for (const table of OPTIONAL_TABLES) {
    const value = parsed[table];
    if (value === undefined) {
      tables[table] = [];
      warnings.push(`备份不含 ${table}，将导入为空`);
    } else if (Array.isArray(value) && value.every(isRecord)) {
      tables[table] = value as BackupRow[];
    } else {
      errors.push(`数据表 ${table} 格式错误`);
    }
  }

  if (errors.length === 0) {
    const words = tables.words;
    const wordIds = new Set<string>();
    words.forEach((row, index) => {
      if (!hasString(row, 'id') || !hasString(row, 'term') || !hasString(row, 'normalizedTerm')) {
        errors.push(`words[${index}] 缺少 id/term/normalizedTerm`);
        return;
      }
      if (wordIds.has(row.id as string)) errors.push(`words[${index}] id 重复`);
      wordIds.add(row.id as string);
    });

    const seenNormalized = new Set<string>();
    for (const row of words) {
      const normalized = String(row.normalizedTerm).toLowerCase();
      if (seenNormalized.has(normalized)) errors.push(`单词重复：${String(row.term)}`);
      seenNormalized.add(normalized);
    }

    const deckIds = new Set(tables.decks.map((row) => row.id));
    const stateWordIds = new Set<string>();
    tables.userWordStates.forEach((row, index) => {
      if (!hasString(row, 'wordId')) {
        errors.push(`userWordStates[${index}] 缺少 wordId`);
        return;
      }
      const wordId = row.wordId as string;
      if (!wordIds.has(wordId)) errors.push(`记忆状态引用了不存在的单词 ${wordId}`);
      if (stateWordIds.has(wordId)) errors.push(`同一单词存在重复记忆状态：${wordId}`);
      stateWordIds.add(wordId);
    });

    tables.deckWords.forEach((row, index) => {
      if (!deckIds.has(row.deckId as string)) errors.push(`deckWords[${index}] 词书不存在`);
      if (!wordIds.has(row.wordId as string)) errors.push(`deckWords[${index}] 单词不存在`);
    });

    tables.reviewLogs.forEach((row, index) => {
      if (!wordIds.has(row.wordId as string)) errors.push(`reviewLogs[${index}] 单词不存在`);
      if (!['known', 'fuzzy', 'forgot'].includes(String(row.rating))) {
        errors.push(`reviewLogs[${index}] rating 非法`);
      }
    });

    const sessionIds = new Set(tables.sessions.map((row) => row.id));
    tables.reviewLogs.forEach((row, index) => {
      if (row.sessionId && !sessionIds.has(row.sessionId as string)) {
        warnings.push(`reviewLogs[${index}] 的 sessionId 不在会话表中`);
      }
    });
  }

  if (errors.length > 0) return { ok: false, errors, warnings };
  return {
    ok: true,
    errors,
    warnings,
    document: { meta: meta as unknown as DocumentMeta, ...(tables as unknown as BackupTables) },
  };
}

export type { AiExamplePayload };
