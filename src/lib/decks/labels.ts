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

/** Where the built-in decks come from. Never presented as an official syllabus. */
export const BUILT_IN_DECK_NOTE =
  '词表与中文释义来自 ECDICT（MIT 许可）的考试标签，按词频与标签整理，不是官方考纲全集。';

export const VOCABULARY_RELEASE = '2026.10';