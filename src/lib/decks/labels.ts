import type { ExamType } from '@/lib/types';

/** Human labels for deck categories. Never presented as official word lists. */
export const EXAM_LABELS: Record<ExamType, string> = {
  CET4: '四级',
  CET6: '六级',
  GAOKAO: '高考',
  KAOYAN: '考研',
  JUNIOR: '初高中',
  IELTS: '雅思',
  TOEFL: '托福',
  GRE: 'GRE',
  BUSINESS: '商务',
  DAILY: '日常',
  TECH: '科技',
  custom: '自定义',
};

export const EXAM_OPTIONS = Object.entries(EXAM_LABELS) as [ExamType, string][];

export function examLabel(type: ExamType): string {
  return EXAM_LABELS[type] ?? type;
}

/** Short, honest description shown next to each demo deck. */
export const DEMO_DECK_NOTE =
  '原创手写演示词条，用于体验学习流程；不是官方词表，也不代表考试范围。';

export const VOCABULARY_RELEASE = '2026.10';