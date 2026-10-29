import type { DeckCatalogEntry, ExamType } from '@/lib/types';

/**
 * Deck catalogue. Every category is listed even when no data ships with the
 * app — in that case the UI shows "尚未导入" instead of a made-up word count.
 *
 * `suggestedSource` documents where a *licensed* pack would come from. It is
 * never fetched automatically and never fabricated.
 */
export const DECK_CATALOG: DeckCatalogEntry[] = [
  {
    key: 'CET4',
    name: '大学英语四级 CET-4',
    description: '四级大纲核心词汇，适合大一至大二备考。',
    suggestedSource: '自行导入：学校讲义 / 已购买授权的词表 / 开放许可词表',
    deckIds: [],
  },
  {
    key: 'CET6',
    name: '大学英语六级 CET-6',
    description: '六级高频词与抽象词，适合已过四级的同学。',
    suggestedSource: '自行导入：学校讲义 / 已购买授权的词表 / 开放许可词表',
    deckIds: [],
  },
  {
    key: 'KAOYAN',
    name: '考研英语',
    description: '考研阅读与写作常用学术词。',
    suggestedSource: '自行导入：考研机构授权词表 / 自建词表',
    deckIds: [],
  },
  {
    key: 'GAOKAO',
    name: '高考英语',
    description: '高考大纲高频词，适合高中生与基础巩固。',
    suggestedSource: '自行导入：教材配套词表（确认授权）',
    deckIds: [],
  },
  {
    key: 'JUNIOR',
    name: '初高中核心词汇',
    description: '初中至高中衔接阶段的最高频基础词。',
    suggestedSource: '自行导入：教材配套词表（确认授权）',
    deckIds: [],
  },
  {
    key: 'IELTS',
    name: '雅思 IELTS',
    description: '学术类雅思小作文数据描述与大作文论证词。',
    suggestedSource: '自行导入：已授权雅思词表 / 自建词表',
    deckIds: [],
  },
  {
    key: 'TOEFL',
    name: '托福 TOEFL',
    description: '托福阅读与听力讲座场景学术词。',
    suggestedSource: '自行导入：已授权托福词表 / 自建词表',
    deckIds: [],
  },
  {
    key: 'GRE',
    name: 'GRE',
    description: 'GRE 填空与阅读高阶词汇。',
    suggestedSource: '自行导入：已授权 GRE 词表 / 自建词表',
    deckIds: [],
  },
  {
    key: 'BUSINESS',
    name: '商务英语',
    description: '会议、财务、招聘与项目管理场景词。',
    suggestedSource: '自行导入：商务英语教材配套词表',
    deckIds: [],
  },
  {
    key: 'custom',
    name: '自定义词书',
    description: '你自己的词表：课程、专业术语或任何自建列表。',
    suggestedSource: '手动导入 CSV / JSON',
    deckIds: [],
  },
];

export function catalogEntryFor(type: ExamType): DeckCatalogEntry | undefined {
  return DECK_CATALOG.find((entry) => entry.key === type);
}
