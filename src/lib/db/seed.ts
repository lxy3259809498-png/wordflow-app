import type { Deck, Word } from '@/lib/types';
import { EXTRA_DECK_SEEDS } from '@/lib/db/seedExtra';

/**
 * Demo vocabulary set — written for WordFlow, not copied from any commercial
 * glossary. It is intentionally small and clearly labelled as a sample: users
 * import their own licensed CET-4/CET-6 lists via the Decks page.
 */
export interface SeedWord {
  term: string;
  phonetic: string;
  pos: string;
  zh: string[];
  example: [string, string];
  mnemonic?: string;
  tags: string[];
}

const CET4_WORDS: SeedWord[] = [
  {
    term: 'abandon',
    phonetic: '/əˈbændən/',
    pos: 'v.',
    zh: ['放弃，抛弃', '离弃，遗弃'],
    example: ['They had to abandon the plan because of the storm.', '因为暴风雨，他们不得不放弃这个计划。'],
    mnemonic: 'a + band（乐队）+ on：乐队散了，于是放弃巡演。',
    tags: ['高频', '动词'],
  },
  {
    term: 'absorb',
    phonetic: '/əbˈzɔːb/',
    pos: 'v.',
    zh: ['吸收（液体、光、热）', '使全神贯注'],
    example: ['Plants absorb water through their roots.', '植物通过根吸收水分。'],
    mnemonic: 'ab（离开）+ sorb（吸）：把东西吸走。',
    tags: ['科学', '动词'],
  },
  {
    term: 'accurate',
    phonetic: '/ˈækjərət/',
    pos: 'adj.',
    zh: ['准确的，精确的'],
    example: ['We need accurate data before making a decision.', '做决定前我们需要准确的数据。'],
    mnemonic: 'ac + cur（关心）+ ate：反复关心细节，结果就准确。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'adapt',
    phonetic: '/əˈdæpt/',
    pos: 'v.',
    zh: ['适应', '改编，改写'],
    example: ['Freshmen usually need a month to adapt to campus life.', '新生通常需要一个月适应校园生活。'],
    mnemonic: 'ad + apt（合适的）：一点点变得合适，就是适应。',
    tags: ['校园', '动词'],
  },
  {
    term: 'adequate',
    phonetic: '/ˈædɪkwət/',
    pos: 'adj.',
    zh: ['足够的，充分的', '尚可的'],
    example: ['The dorm provides adequate space for two students.', '这间宿舍给两名学生提供了足够的空间。'],
    mnemonic: 'ad + equ（相等）+ ate：数量与需求相等，即足够。',
    tags: ['形容词'],
  },
  {
    term: 'benefit',
    phonetic: '/ˈbenɪfɪt/',
    pos: 'n. / v.',
    zh: ['益处，好处', '受益，有益于'],
    example: ['Regular review brings long-term benefits.', '规律复习会带来长期收益。'],
    mnemonic: 'bene（好）+ fit：好事落到身上。',
    tags: ['高频', '名词'],
  },
  {
    term: 'capacity',
    phonetic: '/kəˈpæsəti/',
    pos: 'n.',
    zh: ['容量，容积', '能力'],
    example: ['The lecture hall has a capacity of 300 people.', '这个报告厅能容纳 300 人。'],
    mnemonic: 'cap（拿）+ acity：能拿多少，就是容量。',
    tags: ['名词'],
  },
  {
    term: 'challenge',
    phonetic: '/ˈtʃælɪndʒ/',
    pos: 'n. / v.',
    zh: ['挑战，难题', '向……挑战'],
    example: ['Learning 3000 words is a real challenge.', '记 3000 个单词是个真正的挑战。'],
    tags: ['高频'],
  },
  {
    term: 'community',
    phonetic: '/kəˈmjuːnəti/',
    pos: 'n.',
    zh: ['社区，团体', '共同体'],
    example: ['The library is a quiet place for the whole community.', '图书馆是全体社区成员安静的去处。'],
    mnemonic: 'com（共同）+ mun（服务）+ ity：共同服务的一群人。',
    tags: ['社会', '名词'],
  },
  {
    term: 'consume',
    phonetic: '/kənˈsjuːm/',
    pos: 'v.',
    zh: ['消耗，消费', '吃喝'],
    example: ['Streaming videos consumes a lot of mobile data.', '看视频会消耗大量移动数据。'],
    mnemonic: 'con（完全）+ sume（拿）：全部拿走 → 消耗。',
    tags: ['动词'],
  },
  {
    term: 'contribute',
    phonetic: '/kənˈtrɪbjuːt/',
    pos: 'v.',
    zh: ['贡献，捐助', '促成，导致'],
    example: ['Daily practice contributes to better pronunciation.', '每天练习有助于改善发音。'],
    mnemonic: 'con + tribute（给予）：一起给出力量。',
    tags: ['写作', '动词'],
  },
  {
    term: 'decline',
    phonetic: '/dɪˈklaɪn/',
    pos: 'v. / n.',
    zh: ['下降，衰退', '婉拒'],
    example: ['He politely declined the invitation to the party.', '他礼貌地拒绝了这个聚会邀请。'],
    mnemonic: 'de（向下）+ cline（倾斜）：向下倾斜就是下降。',
    tags: ['高频', '动词'],
  },
  {
    term: 'efficient',
    phonetic: '/ɪˈfɪʃnt/',
    pos: 'adj.',
    zh: ['高效的，效率高的'],
    example: ['Spaced repetition is an efficient way to remember words.', '间隔重复是记单词的高效方法。'],
    mnemonic: 'ef（出）+ fic（做）+ ient：做出来的多，效率高。',
    tags: ['形容词'],
  },
  {
    term: 'encounter',
    phonetic: '/ɪnˈkaʊntə(r)/',
    pos: 'v. / n.',
    zh: ['遇到，遭遇', '邂逅'],
    example: ['You will encounter many new words in this article.', '你会在文章里遇到许多生词。'],
    mnemonic: 'en + counter（相对）：面对面撞上 → 遭遇。',
    tags: ['动词'],
  },
  {
    term: 'essential',
    phonetic: '/ɪˈsenʃl/',
    pos: 'adj. / n.',
    zh: ['必不可少的，本质的', '要素'],
    example: ['Sleep is essential for memory consolidation.', '睡眠对记忆巩固必不可少。'],
    mnemonic: 'essence（本质）+ ial：属于本质的。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'establish',
    phonetic: '/ɪˈstæblɪʃ/',
    pos: 'v.',
    zh: ['建立，创办', '确立'],
    example: ['The university was established in 1898.', '这所大学创建于 1898 年。'],
    mnemonic: 'e + stabl（stable 稳定）+ ish：让事物稳定下来。',
    tags: ['动词'],
  },
  {
    term: 'familiar',
    phonetic: '/fəˈmɪliə(r)/',
    pos: 'adj.',
    zh: ['熟悉的', '常见的'],
    example: ['The word looks familiar, but I forgot its meaning.', '这个词看着眼熟，但我忘了意思。'],
    mnemonic: 'family（家庭）+ ar：像家人一样熟悉。',
    tags: ['高频', '形容词'],
  },
  {
    term: 'generate',
    phonetic: '/ˈdʒenəreɪt/',
    pos: 'v.',
    zh: ['产生，生成'],
    example: ['The app generates a new review plan every day.', '这个应用每天生成新的复习计划。'],
    mnemonic: 'gener（种类、生育）+ ate：生出新东西。',
    tags: ['科技', '动词'],
  },
  {
    term: 'impact',
    phonetic: '/ˈɪmpækt/',
    pos: 'n. / v.',
    zh: ['影响，冲击', '对……产生影响'],
    example: ['Small habits have a big impact on exam results.', '小习惯对考试结果影响很大。'],
    mnemonic: 'im + pact（压紧）：压进去的力量 → 冲击。',
    tags: ['写作', '名词'],
  },
  {
    term: 'maintain',
    phonetic: '/meɪnˈteɪn/',
    pos: 'v.',
    zh: ['维持，保持', '维修，保养'],
    example: ['It is hard to maintain a 30-day streak.', '保持 30 天连续打卡并不容易。'],
    mnemonic: 'main（手）+ tain（握住）：用手一直握着 → 维持。',
    tags: ['高频', '动词'],
  },
  {
    term: 'obtain',
    phonetic: '/əbˈteɪn/',
    pos: 'v.',
    zh: ['获得，得到'],
    example: ['You can obtain the audio files from the official site.', '你可以从官网获取音频文件。'],
    mnemonic: 'ob + tain（握住）：伸手握住 → 获得。',
    tags: ['动词'],
  },
  {
    term: 'occur',
    phonetic: '/əˈkɜː(r)/',
    pos: 'v.',
    zh: ['发生，出现', '被想到'],
    example: ['Most mistakes occur when we review too fast.', '大多数错误发生在我们复习太快的时候。'],
    mnemonic: 'oc + cur（跑）：跑过来 → 发生。',
    tags: ['动词'],
  },
  {
    term: 'participate',
    phonetic: '/pɑːˈtɪsɪpeɪt/',
    pos: 'v.',
    zh: ['参加，参与'],
    example: ['Everyone is encouraged to participate in the speaking club.', '鼓励大家参加口语社。'],
    mnemonic: 'part（部分）+ cip（拿）+ ate：拿到一份 → 参与。',
    tags: ['校园', '动词'],
  },
  {
    term: 'previous',
    phonetic: '/ˈpriːviəs/',
    pos: 'adj.',
    zh: ['以前的，先前的'],
    example: ['The previous chapter introduced the same grammar point.', '上一章讲过同一个语法点。'],
    mnemonic: 'pre（前）+ vi（路）+ ous：走在前面的路。',
    tags: ['形容词'],
  },
  {
    term: 'reduce',
    phonetic: '/rɪˈdjuːs/',
    pos: 'v.',
    zh: ['减少，降低'],
    example: ['Turning off notifications can reduce distractions.', '关闭通知可以减少分心。'],
    mnemonic: 're（回）+ duce（引导）：往回引 → 减少。',
    tags: ['高频', '动词'],
  },
  {
    term: 'reliable',
    phonetic: '/rɪˈlaɪəbl/',
    pos: 'adj.',
    zh: ['可靠的，可信赖的'],
    example: ['This dictionary is a reliable source of examples.', '这本词典是可靠的例句来源。'],
    mnemonic: 'rely（依靠）+ able：可以依靠的。',
    tags: ['形容词'],
  },
  {
    term: 'require',
    phonetic: '/rɪˈkwaɪə(r)/',
    pos: 'v.',
    zh: ['需要', '要求'],
    example: ['The course requires 20 minutes of practice a day.', '这门课要求每天练习 20 分钟。'],
    mnemonic: 're + quire（寻求）：反复寻求 → 需要。',
    tags: ['高频', '动词'],
  },
  {
    term: 'significant',
    phonetic: '/sɪɡˈnɪfɪkənt/',
    pos: 'adj.',
    zh: ['重要的，显著的'],
    example: ['There was a significant improvement in her listening score.', '她的听力成绩有显著提高。'],
    mnemonic: 'sign（标记）+ ific + ant：值得做标记的 → 重要的。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'strategy',
    phonetic: '/ˈstrætədʒi/',
    pos: 'n.',
    zh: ['策略，办法'],
    example: ['Active recall is a better strategy than rereading.', '主动回忆比反复阅读是更好的策略。'],
    mnemonic: 'strateg（将军）+ y：将军的用兵之道。',
    tags: ['名词'],
  },
  {
    term: 'transfer',
    phonetic: '/trænsˈfɜː(r)/',
    pos: 'v. / n.',
    zh: ['转移，调动', '转车，转账'],
    example: ['You can transfer the data to a new phone.', '你可以把数据转移到新手机上。'],
    mnemonic: 'trans（穿过）+ fer（带）：带过去 → 转移。',
    tags: ['动词'],
  },
  {
    term: 'variety',
    phonetic: '/vəˈraɪəti/',
    pos: 'n.',
    zh: ['多样性，种类'],
    example: ['A variety of exercises keeps study interesting.', '多种练习让学习不枯燥。'],
    mnemonic: 'vari（变化）+ ety：变化多 → 多样。',
    tags: ['名词'],
  },
];

const CET6_WORDS: SeedWord[] = [
  {
    term: 'ambiguous',
    phonetic: '/æmˈbɪɡjuəs/',
    pos: 'adj.',
    zh: ['模棱两可的，含糊不清的'],
    example: ['His answer was ambiguous, so nobody knew the plan.', '他的回答模棱两可，没人知道计划是什么。'],
    mnemonic: 'ambi（两边）+ gu（走）+ ous：两边都能走 → 含糊。',
    tags: ['阅读', '形容词'],
  },
  {
    term: 'anticipate',
    phonetic: '/ænˈtɪsɪpeɪt/',
    pos: 'v.',
    zh: ['预料，预期', '期待'],
    example: ['We anticipate a rise in enrollment next year.', '我们预计明年报名人数会上升。'],
    mnemonic: 'anti（前）+ cip（拿）+ ate：提前拿到 → 预料。',
    tags: ['写作', '动词'],
  },
  {
    term: 'coherent',
    phonetic: '/kəʊˈhɪərənt/',
    pos: 'adj.',
    zh: ['连贯的，有条理的'],
    example: ['A coherent essay needs one clear main idea.', '一篇连贯的文章需要一个清晰的主旨。'],
    mnemonic: 'co（共同）+ here（粘）+ ent：粘在一起 → 连贯。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'compensate',
    phonetic: '/ˈkɒmpenseɪt/',
    pos: 'v.',
    zh: ['补偿，弥补'],
    example: ['Extra practice can compensate for a late start.', '额外练习可以弥补起步晚。'],
    mnemonic: 'com + pens（称重）+ ate：两边称平 → 补偿。',
    tags: ['动词'],
  },
  {
    term: 'comprehensive',
    phonetic: '/ˌkɒmprɪˈhensɪv/',
    pos: 'adj.',
    zh: ['全面的，综合的'],
    example: ['The report gives a comprehensive view of the market.', '这份报告提供了市场的全景。'],
    mnemonic: 'com（全部）+ prehend（抓住）+ ive：全部抓住 → 全面。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'controversial',
    phonetic: '/ˌkɒntrəˈvɜːʃl/',
    pos: 'adj.',
    zh: ['有争议的'],
    example: ['The new grading rule is controversial among students.', '新的评分规则在学生中有争议。'],
    mnemonic: 'contro（相对）+ vers（转）+ ial：朝相反方向转 → 争议。',
    tags: ['阅读', '形容词'],
  },
  {
    term: 'deliberate',
    phonetic: '/dɪˈlɪbərət/',
    pos: 'adj. / v.',
    zh: ['故意的，深思熟虑的', '仔细考虑'],
    example: ['She made a deliberate choice to review before bed.', '她有意选择睡前复习。'],
    mnemonic: 'de + liber（天平）+ ate：反复称量 → 深思熟虑。',
    tags: ['阅读'],
  },
  {
    term: 'diminish',
    phonetic: '/dɪˈmɪnɪʃ/',
    pos: 'v.',
    zh: ['减少，削弱'],
    example: ['Interest tends to diminish without visible progress.', '没有可见进步时，兴趣容易减弱。'],
    mnemonic: 'di + min（小）+ ish：变小 → 减少。',
    tags: ['动词'],
  },
  {
    term: 'elaborate',
    phonetic: '/ɪˈlæbərət/',
    pos: 'adj. / v.',
    zh: ['精心制作的，复杂的', '详细说明'],
    example: ['Could you elaborate on your answer?', '你能详细说明一下你的答案吗？'],
    mnemonic: 'e（出）+ labor（劳动）+ ate：花功夫做出来 → 精细。',
    tags: ['动词'],
  },
  {
    term: 'empirical',
    phonetic: '/ɪmˈpɪrɪkl/',
    pos: 'adj.',
    zh: ['经验的，实证的'],
    example: ['The claim is supported by empirical evidence.', '这一说法有实证证据支持。'],
    mnemonic: 'em + pir（尝试）+ ical：试出来的 → 实证的。',
    tags: ['学术', '形容词'],
  },
  {
    term: 'explicit',
    phonetic: '/ɪkˈsplɪsɪt/',
    pos: 'adj.',
    zh: ['明确的，清晰的', '直言的'],
    example: ['The instructions are explicit about the deadline.', '说明里对截止日期写得很明确。'],
    mnemonic: 'ex（出）+ plic（折叠）+ it：展开来 → 明确。',
    tags: ['阅读', '形容词'],
  },
  {
    term: 'feasible',
    phonetic: '/ˈfiːzəbl/',
    pos: 'adj.',
    zh: ['可行的'],
    example: ['Is it feasible to finish the project in two weeks?', '两周内完成这个项目可行吗？'],
    mnemonic: 'feas（做）+ ible：能做的 → 可行。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'implicit',
    phonetic: '/ɪmˈplɪsɪt/',
    pos: 'adj.',
    zh: ['含蓄的，暗示的', '内在的'],
    example: ['There is an implicit rule against talking in the library.', '图书馆有一条不成文的规矩：不许说话。'],
    mnemonic: 'im（里）+ plic（折）+ it：折在里面 → 含蓄。',
    tags: ['阅读', '形容词'],
  },
  {
    term: 'inevitable',
    phonetic: '/ɪnˈevɪtəbl/',
    pos: 'adj.',
    zh: ['不可避免的'],
    example: ['Forgetting is inevitable without review.', '不复习的话遗忘是不可避免的。'],
    mnemonic: 'in（不）+ evit（避免）+ able：不可避免。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'integrate',
    phonetic: '/ˈɪntɪɡreɪt/',
    pos: 'v.',
    zh: ['整合，使成为一体'],
    example: ['Try to integrate new words into your own sentences.', '试着把新词整合进你自己的句子里。'],
    mnemonic: 'integr（完整）+ ate：使完整 → 整合。',
    tags: ['动词'],
  },
  {
    term: 'perspective',
    phonetic: '/pəˈspektɪv/',
    pos: 'n.',
    zh: ['视角，观点', '透视法'],
    example: ['From a learner’s perspective, feedback must be fast.', '从学习者的角度看，反馈必须快。'],
    mnemonic: 'per（穿过）+ spect（看）+ ive：穿透看过去 → 视角。',
    tags: ['名词'],
  },
  {
    term: 'phenomenon',
    phonetic: '/fəˈnɒmɪnən/',
    pos: 'n.',
    zh: ['现象', '非凡的人或事'],
    example: ['Cramming is a common phenomenon before exams.', '考前突击是常见现象。'],
    mnemonic: 'phen（显现）+ omenon：显现出来的事 → 现象。',
    tags: ['学术', '名词'],
  },
  {
    term: 'preliminary',
    phonetic: '/prɪˈlɪmɪnəri/',
    pos: 'adj. / n.',
    zh: ['初步的，预备的', '初赛'],
    example: ['These are preliminary results, not final numbers.', '这些是初步结果，不是最终数字。'],
    mnemonic: 'pre（前）+ limin（门槛）+ ary：进门前 → 初步。',
    tags: ['学术', '形容词'],
  },
  {
    term: 'profound',
    phonetic: '/prəˈfaʊnd/',
    pos: 'adj.',
    zh: ['深刻的，深远的'],
    example: ['The book had a profound effect on my study habits.', '这本书对我的学习习惯有深远影响。'],
    mnemonic: 'pro（向前）+ found（底）：探到底 → 深刻。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'reinforce',
    phonetic: '/ˌriːɪnˈfɔːs/',
    pos: 'v.',
    zh: ['加强，强化'],
    example: ['Explaining a word to a friend reinforces your memory.', '向朋友解释一个词会强化你的记忆。'],
    mnemonic: 're（再）+ in + force（力量）：再加一把力。',
    tags: ['写作', '动词'],
  },
  {
    term: 'reluctant',
    phonetic: '/rɪˈlʌktənt/',
    pos: 'adj.',
    zh: ['不情愿的，勉强的'],
    example: ['He was reluctant to speak in front of the class.', '他不愿意在全班面前发言。'],
    mnemonic: 're（反）+ luct（挣扎）+ ant：心里挣扎 → 不情愿。',
    tags: ['阅读', '形容词'],
  },
  {
    term: 'substantial',
    phonetic: '/səbˈstænʃl/',
    pos: 'adj.',
    zh: ['大量的，可观的', '实质的'],
    example: ['She made substantial progress in three months.', '她三个月里取得了可观的进步。'],
    mnemonic: 'sub（下面）+ stant（站）+ ial：有实体站得住 → 实质的。',
    tags: ['写作', '形容词'],
  },
  {
    term: 'sustain',
    phonetic: '/səˈsteɪn/',
    pos: 'v.',
    zh: ['维持，支撑', '遭受'],
    example: ['It is easier to sustain a habit with a small daily goal.', '每日目标小一点，习惯更容易维持。'],
    mnemonic: 'sus（下面）+ tain（握住）：从下面托住 → 支撑。',
    tags: ['动词'],
  },
  {
    term: 'tentative',
    phonetic: '/ˈtentətɪv/',
    pos: 'adj.',
    zh: ['暂定的，试探性的'],
    example: ['We made a tentative plan for the summer term.', '我们为夏季学期做了暂定计划。'],
    mnemonic: 'tent（尝试）+ ative：试着来的 → 暂定。',
    tags: ['形容词'],
  },
  {
    term: 'undermine',
    phonetic: '/ˌʌndəˈmaɪn/',
    pos: 'v.',
    zh: ['逐渐削弱，破坏'],
    example: ['Too many notifications can undermine your focus.', '过多通知会逐渐削弱你的专注力。'],
    mnemonic: 'under（下面）+ mine（挖）：从底下挖空 → 削弱。',
    tags: ['阅读', '动词'],
  },
];

export function buildSeedWord(seed: SeedWord, index: number, deckKey: string): Word {
  const now = Date.now();
  return {
    id: `${deckKey}-${String(index + 1).padStart(3, '0')}`,
    term: seed.term,
    normalizedTerm: seed.term.trim().toLowerCase(),
    phonetic: seed.phonetic,
    // Demo data ships one transcribed phonetic; both accents reuse it so the
    // UI never claims a US/UK phonetic that wasn't authored.
    phoneticUS: seed.phonetic,
    phoneticUK: seed.phonetic,
    partOfSpeech: seed.pos,
    definitions: seed.zh,
    examples: [{ en: seed.example[0], zh: seed.example[1] }],
    translations: [],
    // No recorded audio ships with the demo set: TTS is the real mechanism.
    audioUS: null,
    audioUK: null,
    tags: seed.tags,
    source: 'WordFlow demo set (hand-written for this project)',
    licenseNote: 'CC BY 4.0 — WordFlow original demo content, safe to reuse with attribution.',
    mnemonic: seed.mnemonic ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export const DEMO_DECKS: Deck[] = [
  {
    id: 'deck-cet4-demo',
    name: 'CET-4 演示词书',
    examType: 'CET4',
    description:
      '31 个手写演示词条，用于体验完整学习流程。不是官方词库，也不代表四级考纲全集。',
    source: 'WordFlow demo set',
    licenseNote: 'CC BY 4.0 — 本项目原创示例，可自行替换为合法授权的词库。',
    isDemo: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'deck-cet6-demo',
    name: 'CET-6 演示词书',
    examType: 'CET6',
    description:
      '25 个手写演示词条，覆盖六级常见抽象词。请在「词书」页导入你有权使用的正式词表。',
    source: 'WordFlow demo set',
    licenseNote: 'CC BY 4.0 — 本项目原创示例，可自行替换为合法授权的词库。',
    isDemo: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export function getDemoWords(): { deck: Deck; words: Word[] }[] {
  const core = [
    {
      deck: DEMO_DECKS[0],
      words: CET4_WORDS.map((w, i) => buildSeedWord(w, i, 'cet4')),
    },
    {
      deck: DEMO_DECKS[1],
      words: CET6_WORDS.map((w, i) => buildSeedWord(w, i, 'cet6')),
    },
  ];
  const extra = EXTRA_DECK_SEEDS.map(({ deck, prefix, words }) => ({
    deck,
    words: words.map((w, i) => buildSeedWord(w, i, prefix)),
  }));
  return [...core, ...extra];
}

export const DEMO_WORD_COUNT = getDemoWords().reduce((sum, entry) => sum + entry.words.length, 0);
export const DEMO_DECK_COUNT = getDemoWords().length;

// ---------------------------------------------------------------------------
// Full-size exam decks generated from ECDICT (MIT). These are the real
// vocabulary sizes: 中考 1.6k, 高考 3.7k, 四级 3.8k, 六级 5.4k, 考研 4.8k,
// 雅思 5.0k, 托福 6.9k, GRE 7.5k. Each deck lives in its own module and is
// loaded on demand so the entry bundle stays small.
// ---------------------------------------------------------------------------

import {
  GENERATED_DECK_INDEX,
  loadGeneratedDeck,
  type GeneratedDeck,
} from '@/lib/db/seedDecks.generated';

export { GENERATED_DECK_INDEX };

/** Converts one generated deck into the Deck/Word rows the DB stores. */
export function buildGeneratedDeckRows(deck: GeneratedDeck): { deck: Deck; words: Word[] } {
  const now = Date.now();
  const deckRow: Deck = {
    id: `deck-${deck.id}`,
    name: deck.name,
    examType: deck.examType as Deck['examType'],
    description: `${deck.count} 词 · ${deck.note}。词表与释义来自 ECDICT（MIT 许可）的考试标签，不是官方考纲全集。`,
    source: 'ECDICT (github.com/skywind3000/ECDICT)',
    licenseNote: 'MIT License — 词表与中文释义源自 ECDICT，可自由使用与再分发。',
    isDemo: false,
    dataVersion: '2026.10',
    createdAt: now,
    updatedAt: now,
  };
  const words: Word[] = deck.words.map((word, index) => ({
    // Stable ids so re-seeding updates instead of duplicating.
    id: `${deck.id}-${String(index + 1).padStart(5, '0')}`,
    term: word.term,
    normalizedTerm: word.term.trim().toLowerCase(),
    phonetic: word.phonetic,
    phoneticUS: word.phonetic,
    phoneticUK: word.phonetic,
    partOfSpeech: word.partOfSpeech,
    definitions: word.definitions,
    examples: [],
    translations: [],
    // No recorded audio is bundled; the app uses online dictionary audio or TTS.
    audioUS: null,
    audioUK: null,
    tags: [],
    source: 'ECDICT',
    licenseNote: 'MIT License — ECDICT',
    mnemonic: null,
    createdAt: now,
    updatedAt: now,
  }));
  return { deck: deckRow, words };
}

/**
 * Loads every generated deck. Only call this from the seeding path — it pulls
 * in all word lists, which is why the app otherwise imports the index alone.
 *
 * Important: `words.normalizedTerm` is globally unique, and 8.7k of these terms
 * appear in more than one exam list (e.g. "abandon" is in 四级 and 六级). So the
 * result is a shared word pool plus per-deck links — exactly the model the app
 * already uses for user imports. Words are NOT duplicated per deck.
 */
export async function loadGeneratedDecks(): Promise<{
  decks: Deck[];
  words: Word[];
  links: { id: string; deckId: string; wordId: string; createdAt: number }[];
}> {
  const decks: Deck[] = [];
  const wordPool = new Map<string, Word>();
  const links: { id: string; deckId: string; wordId: string; createdAt: number }[] = [];

  for (const entry of GENERATED_DECK_INDEX) {
    const full = await loadGeneratedDeck(entry.id);
    if (!full) continue;
    const { deck } = buildGeneratedDeckRows(full);
    decks.push(deck);
    const now = Date.now();

    full.words.forEach((word, index) => {
      const key = word.term.trim().toLowerCase();
      let row = wordPool.get(key);
      if (!row) {
        row = {
          id: `w-${key}`,
          term: word.term,
          normalizedTerm: key,
          phonetic: word.phonetic,
          phoneticUS: word.phonetic,
          phoneticUK: word.phonetic,
          partOfSpeech: word.partOfSpeech,
          definitions: word.definitions,
          examples: [],
          translations: [],
          audioUS: null,
          audioUK: null,
          tags: [],
          source: 'ECDICT',
          licenseNote: 'MIT License — ECDICT',
          mnemonic: null,
          createdAt: now,
          updatedAt: now,
        };
        wordPool.set(key, row);
      }
      links.push({
        id: `${deck.id}:${row.id}`,
        deckId: deck.id,
        wordId: row.id,
        createdAt: now + index,
      });
    });
  }

  return { decks, words: [...wordPool.values()], links };
}
