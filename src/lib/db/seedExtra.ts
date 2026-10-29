import type { Deck } from '@/lib/types';
import type { SeedWord } from '@/lib/db/seed';

/**
 * Extra hand-written demo decks. All entries are original content written for
 * WordFlow; they are NOT official exam word lists and make no claim to be
 * complete or authoritative. Terms must not repeat across decks (the database
 * enforces a unique normalizedTerm).
 */

export interface ExtraDeckSeed {
  deck: Deck;
  prefix: string;
  words: SeedWord[];
}

const now = Date.now();

const deck = (
  id: string,
  name: string,
  examType: Deck['examType'],
  description: string,
  wordCount: number,
): Deck => ({
  id,
  name,
  examType,
  description: `${wordCount} 个手写演示词条。${description}`,
  source: 'WordFlow demo set',
  licenseNote: 'CC BY 4.0 — 本项目原创示例，可自行替换为合法授权的词库。',
  isDemo: true,
  createdAt: now,
  updatedAt: now,
});

/* ------------------------------ 高考 ------------------------------ */
const GAOKAO: SeedWord[] = [
  { term: 'achieve', phonetic: '/əˈtʃiːv/', pos: 'v.', zh: ['实现；达到'], example: ['She achieved her goal of entering a top university.', '她实现了考入顶尖大学的目标。'], tags: ['高考', '高频'] },
  { term: 'admire', phonetic: '/ədˈmaɪə(r)/', pos: 'v.', zh: ['钦佩；欣赏'], example: ['I admire her courage to speak up.', '我钦佩她敢于发声的勇气。'], mnemonic: 'ad + mir（惊奇）→ 看到就惊叹，于是钦佩。', tags: ['高考'] },
  { term: 'advantage', phonetic: '/ədˈvɑːntɪdʒ/', pos: 'n.', zh: ['优势；有利条件'], example: ['Living near school is a big advantage.', '住在学校附近是很大的优势。'], tags: ['高考', '高频'] },
  { term: 'appreciate', phonetic: '/əˈpriːʃieɪt/', pos: 'v.', zh: ['感激；欣赏'], example: ['I really appreciate your help with my homework.', '我非常感激你帮我做作业。'], mnemonic: 'ap + preci（价格）+ ate：认可价值 → 欣赏、感激。', tags: ['高考'] },
  { term: 'attitude', phonetic: '/ˈætɪtjuːd/', pos: 'n.', zh: ['态度'], example: ['A positive attitude makes learning easier.', '积极的态度让学习更轻松。'], tags: ['高考'] },
  { term: 'balance', phonetic: '/ˈbæləns/', pos: 'n. / v.', zh: ['平衡；余额'], example: ['It is important to balance study and rest.', '平衡学习与休息很重要。'], mnemonic: 'ba + lance（秤盘）：两个秤盘一样重。', tags: ['高考'] },
  { term: 'confident', phonetic: '/ˈkɒnfɪdənt/', pos: 'adj.', zh: ['自信的'], example: ['She felt confident before the speech contest.', '演讲比赛前她感到很自信。'], tags: ['高考'] },
  { term: 'courage', phonetic: '/ˈkʌrɪdʒ/', pos: 'n.', zh: ['勇气'], example: ['It takes courage to admit a mistake.', '承认错误需要勇气。'], tags: ['高考'] },
  { term: 'develop', phonetic: '/dɪˈveləp/', pos: 'v.', zh: ['发展；培养'], example: ['Reading helps develop your imagination.', '阅读有助于培养想象力。'], tags: ['高考', '高频'] },
  { term: 'encourage', phonetic: '/ɪnˈkʌrɪdʒ/', pos: 'v.', zh: ['鼓励；促进'], example: ['My teacher encouraged me to join the club.', '老师鼓励我加入社团。'], mnemonic: 'en（使）+ courage（勇气）：给人勇气。', tags: ['高考'] },
  { term: 'environment', phonetic: '/ɪnˈvaɪrənmənt/', pos: 'n.', zh: ['环境'], example: ['We should protect the environment.', '我们应该保护环境。'], tags: ['高考', '高频'] },
  { term: 'experience', phonetic: '/ɪkˈspɪəriəns/', pos: 'n. / v.', zh: ['经历；体验'], example: ['Volunteering was a valuable experience.', '志愿服务是一次宝贵的经历。'], tags: ['高考'] },
  { term: 'graduate', phonetic: '/ˈɡrædʒuət/', pos: 'v. / n.', zh: ['毕业；毕业生'], example: ['She will graduate from high school next June.', '她明年六月高中毕业。'], tags: ['高考'] },
  { term: 'improve', phonetic: '/ɪmˈpruːv/', pos: 'v.', zh: ['改进；提高'], example: ['Practice every day and your listening will improve.', '每天练习，你的听力会提高。'], tags: ['高考', '高频'] },
  { term: 'independent', phonetic: '/ˌɪndɪˈpendənt/', pos: 'adj.', zh: ['独立的'], example: ['Living alone made him more independent.', '独自生活让他更独立。'], tags: ['高考'] },
  { term: 'opportunity', phonetic: '/ˌɒpəˈtjuːnəti/', pos: 'n.', zh: ['机会'], example: ['This exchange program is a great opportunity.', '这个交换项目是很好的机会。'], tags: ['高考', '高频'] },
  { term: 'protect', phonetic: '/prəˈtekt/', pos: 'v.', zh: ['保护'], example: ['Wear a helmet to protect your head.', '戴头盔保护头部。'], tags: ['高考'] },
  { term: 'responsibility', phonetic: '/rɪˌspɒnsəˈbɪləti/', pos: 'n.', zh: ['责任'], example: ["Keeping the classroom clean is everyone's responsibility.", '保持教室清洁是每个人的责任。'], tags: ['高考'] },
  { term: 'suggest', phonetic: '/səˈdʒest/', pos: 'v.', zh: ['建议；表明'], example: ['I suggest reviewing the notes before bed.', '我建议睡前复习笔记。'], tags: ['高考'] },
  { term: 'tradition', phonetic: '/trəˈdɪʃn/', pos: 'n.', zh: ['传统'], example: ['Eating dumplings is a family tradition.', '吃饺子是家里的传统。'], tags: ['高考'] },
];

/* ------------------------------ 考研 ------------------------------ */
const KAOYAN: SeedWord[] = [
  { term: 'abstract', phonetic: '/ˈæbstrækt/', pos: 'adj. / n.', zh: ['抽象的；摘要'], example: ['The theory is too abstract for beginners.', '这个理论对初学者来说太抽象。'], tags: ['考研', '学术'] },
  { term: 'advocate', phonetic: '/ˈædvəkeɪt/', pos: 'v. / n.', zh: ['提倡；拥护者'], example: ['Many researchers advocate a plant-based diet.', '许多研究者提倡植物性饮食。'], tags: ['考研'] },
  { term: 'allocate', phonetic: '/ˈæləkeɪt/', pos: 'v.', zh: ['分配；拨出'], example: ['The school allocated more funds to the library.', '学校给图书馆分配了更多资金。'], mnemonic: 'al + loc（地方）+ ate：安排到各自的位置。', tags: ['考研'] },
  { term: 'arbitrary', phonetic: '/ˈɑːbɪtrəri/', pos: 'adj.', zh: ['任意的；武断的'], example: ['The deadline felt arbitrary and unfair.', '这个截止日期显得随意又不公平。'], tags: ['考研', '阅读'] },
  { term: 'assess', phonetic: '/əˈses/', pos: 'v.', zh: ['评估；评定'], example: ['Teachers assess progress through weekly quizzes.', '老师通过每周小测评估进度。'], tags: ['考研', '学术'] },
  { term: 'assume', phonetic: '/əˈsjuːm/', pos: 'v.', zh: ['假定；承担'], example: ['Do not assume everyone agrees with you.', '不要假定每个人都同意你。'], tags: ['考研'] },
  { term: 'attribute', phonetic: '/əˈtrɪbjuːt/', pos: 'v. / n.', zh: ['把……归因于；属性'], example: ['She attributes her success to daily practice.', '她把成功归因于每日练习。'], mnemonic: 'at + tribute（给予）：把原因给到某处。', tags: ['考研'] },
  { term: 'bias', phonetic: '/ˈbaɪəs/', pos: 'n. / v.', zh: ['偏见；偏差'], example: ['The survey was criticized for selection bias.', '这项调查因选择偏差受到批评。'], tags: ['考研', '学术'] },
  { term: 'constrain', phonetic: '/kənˈstreɪn/', pos: 'v.', zh: ['限制；约束'], example: ['A small budget constrains our options.', '预算有限限制了我们的选择。'], tags: ['考研'] },
  { term: 'contradict', phonetic: '/ˌkɒntrəˈdɪkt/', pos: 'v.', zh: ['反驳；与……矛盾'], example: ['The new data contradict the earlier report.', '新数据与早先的报告相矛盾。'], mnemonic: 'contra（相反）+ dict（说）：说相反的话。', tags: ['考研'] },
  { term: 'crucial', phonetic: '/ˈkruːʃl/', pos: 'adj.', zh: ['关键的；至关重要的'], example: ['Sleep is crucial for memory.', '睡眠对记忆至关重要。'], tags: ['考研', '高频'] },
  { term: 'derive', phonetic: '/dɪˈraɪv/', pos: 'v.', zh: ['获得；源自'], example: ['Many English words derive from Latin.', '许多英语单词源自拉丁语。'], tags: ['考研'] },
  { term: 'distort', phonetic: '/dɪˈstɔːt/', pos: 'v.', zh: ['扭曲；歪曲'], example: ['Small samples can distort the results.', '小样本可能扭曲结果。'], tags: ['考研'] },
  { term: 'emerge', phonetic: '/ɪˈmɜːdʒ/', pos: 'v.', zh: ['出现；显露'], example: ['A clear pattern emerged from the data.', '数据中浮现出清晰的模式。'], mnemonic: 'e（出）+ merge（沉入）：从水里浮出来。', tags: ['考研'] },
  { term: 'evaluate', phonetic: '/ɪˈvæljueɪt/', pos: 'v.', zh: ['评价；评估'], example: ['We need more evidence to evaluate the claim.', '我们需要更多证据来评估这一说法。'], tags: ['考研', '学术'] },
  { term: 'framework', phonetic: '/ˈfreɪmwɜːk/', pos: 'n.', zh: ['框架；体系'], example: ['The paper proposes a new analytical framework.', '论文提出了新的分析框架。'], tags: ['考研', '学术'] },
  { term: 'hypothesis', phonetic: '/haɪˈpɒθəsɪs/', pos: 'n.', zh: ['假设；假说'], example: ['The experiment tested a simple hypothesis.', '这个实验检验了一个简单的假设。'], tags: ['考研', '学术'] },
  { term: 'imply', phonetic: '/ɪmˈplaɪ/', pos: 'v.', zh: ['暗示；意味着'], example: ['Silence does not imply agreement.', '沉默并不意味着同意。'], tags: ['考研'] },
  { term: 'incentive', phonetic: '/ɪnˈsentɪv/', pos: 'n.', zh: ['激励；动机'], example: ['Tax breaks give firms an incentive to invest.', '税收减免激励企业投资。'], tags: ['考研'] },
  { term: 'justify', phonetic: '/ˈdʒʌstɪfaɪ/', pos: 'v.', zh: ['证明……正当'], example: ['Nothing can justify cheating.', '没有任何理由能为作弊开脱。'], tags: ['考研'] },
];

/* ------------------------------ 雅思 ------------------------------ */
const IELTS: SeedWord[] = [
  { term: 'analysis', phonetic: '/əˈnæləsɪs/', pos: 'n.', zh: ['分析；分析结果'], example: ['The analysis shows a steady rise in demand.', '分析显示需求稳步上升。'], tags: ['雅思', '写作'] },
  { term: 'approximate', phonetic: '/əˈprɒksɪmət/', pos: 'adj.', zh: ['大约的；近似的'], example: ['The approximate cost is 200 dollars.', '大约费用是 200 美元。'], tags: ['雅思', '小作文'] },
  { term: 'cite', phonetic: '/saɪt/', pos: 'v.', zh: ['引用；举例'], example: ['Please cite at least three academic sources.', '请至少引用三份学术来源。'], tags: ['雅思', '写作'] },
  { term: 'conduct', phonetic: '/kənˈdʌkt/', pos: 'v. / n.', zh: ['进行；行为'], example: ['They conducted interviews with 50 residents.', '他们对 50 位居民进行了访谈。'], tags: ['雅思', '学术'] },
  { term: 'constitute', phonetic: '/ˈkɒnstɪtjuːt/', pos: 'v.', zh: ['构成；组成'], example: ['Women constitute half of the workforce.', '女性占劳动力的一半。'], tags: ['雅思'] },
  { term: 'context', phonetic: '/ˈkɒntekst/', pos: 'n.', zh: ['语境；背景'], example: ['The figure must be read in context.', '这个数字必须结合背景理解。'], tags: ['雅思', '阅读'] },
  { term: 'criteria', phonetic: '/kraɪˈtɪəriə/', pos: 'n.', zh: ['标准（criterion 的复数）'], example: ['The essay is marked against four criteria.', '作文按四项标准评分。'], tags: ['雅思', '写作'] },
  { term: 'data', phonetic: '/ˈdeɪtə/', pos: 'n.', zh: ['数据'], example: ['The data were collected over six months.', '数据历时六个月收集。'], tags: ['雅思', '小作文'] },
  { term: 'distribution', phonetic: '/ˌdɪstrɪˈbjuːʃn/', pos: 'n.', zh: ['分布；分配'], example: ['The map shows the distribution of rainfall.', '地图显示了降雨分布。'], tags: ['雅思', '小作文'] },
  { term: 'factor', phonetic: '/ˈfæktə(r)/', pos: 'n.', zh: ['因素'], example: ['Cost is a major factor in the decision.', '成本是决策的主要因素。'], tags: ['雅思'] },
  { term: 'indicate', phonetic: '/ˈɪndɪkeɪt/', pos: 'v.', zh: ['表明；指示'], example: ['The results indicate a strong correlation.', '结果表明存在强相关。'], tags: ['雅思', '小作文'] },
  { term: 'interpret', phonetic: '/ɪnˈtɜːprɪt/', pos: 'v.', zh: ['解释；口译'], example: ['It is difficult to interpret these figures.', '很难解释这些数字。'], tags: ['雅思'] },
  { term: 'methodology', phonetic: '/ˌmeθəˈdɒlədʒi/', pos: 'n.', zh: ['方法论；研究方法'], example: ['The methodology section explains the sampling.', '方法论部分说明了抽样过程。'], tags: ['雅思', '学术'] },
  { term: 'percentage', phonetic: '/pəˈsentɪdʒ/', pos: 'n.', zh: ['百分比'], example: ['The percentage of remote workers doubled.', '远程工作者的比例翻了一番。'], tags: ['雅思', '小作文'] },
  { term: 'proportion', phonetic: '/prəˈpɔːʃn/', pos: 'n.', zh: ['比例；部分'], example: ['A large proportion of students commute.', '很大一部分学生通勤。'], tags: ['雅思', '小作文'] },
  { term: 'relevant', phonetic: '/ˈreləvənt/', pos: 'adj.', zh: ['相关的；切题的'], example: ['Include only relevant details in the summary.', '摘要中只保留相关细节。'], tags: ['雅思', '写作'] },
  { term: 'survey', phonetic: '/ˈsɜːveɪ/', pos: 'n. / v.', zh: ['调查；勘测'], example: ['A survey of 1,000 adults was carried out.', '对 1000 名成年人进行了调查。'], tags: ['雅思'] },
  { term: 'tendency', phonetic: '/ˈtendənsi/', pos: 'n.', zh: ['趋势；倾向'], example: ['There is a tendency to overestimate progress.', '人们有高估进度的倾向。'], tags: ['雅思', '写作'] },
  { term: 'valid', phonetic: '/ˈvælɪd/', pos: 'adj.', zh: ['有效的；合理的'], example: ['The argument is valid but incomplete.', '这个论点合理但不完整。'], tags: ['雅思', '写作'] },
  { term: 'variable', phonetic: '/ˈveəriəbl/', pos: 'n. / adj.', zh: ['变量；多变的'], example: ['Age was the strongest variable in the model.', '年龄是模型中最强的变量。'], tags: ['雅思', '学术'] },
];

/* ------------------------------ 托福 ------------------------------ */
const TOEFL: SeedWord[] = [
  { term: 'adjacent', phonetic: '/əˈdʒeɪsnt/', pos: 'adj.', zh: ['邻近的；毗连的'], example: ['The lab is adjacent to the library.', '实验室紧邻图书馆。'], tags: ['托福', '阅读'] },
  { term: 'accumulate', phonetic: '/əˈkjuːmjəleɪt/', pos: 'v.', zh: ['积累；堆积'], example: ['Sediment accumulates slowly on the sea floor.', '沉积物在海底缓慢积累。'], tags: ['托福', '听力'] },
  { term: 'alter', phonetic: '/ˈɔːltə(r)/', pos: 'v.', zh: ['改变；改动'], example: ['Rising temperatures alter migration patterns.', '气温上升改变了迁徙模式。'], tags: ['托福'] },
  { term: 'anomaly', phonetic: '/əˈnɒməli/', pos: 'n.', zh: ['异常；反常现象'], example: ['The satellite detected a temperature anomaly.', '卫星探测到温度异常。'], tags: ['托福', '阅读'] },
  { term: 'apparatus', phonetic: '/ˌæpəˈreɪtəs/', pos: 'n.', zh: ['仪器；装置'], example: ['The apparatus measures air pressure.', '该仪器测量气压。'], tags: ['托福', '听力'] },
  { term: 'boundary', phonetic: '/ˈbaʊndri/', pos: 'n.', zh: ['边界；界限'], example: ['The river forms the boundary between two states.', '这条河构成两州之间的边界。'], tags: ['托福'] },
  { term: 'cluster', phonetic: '/ˈklʌstə(r)/', pos: 'n. / v.', zh: ['群；聚集'], example: ["Stars cluster in the galaxy's centre.", '恒星聚集在银河系中心。'], tags: ['托福'] },
  { term: 'component', phonetic: '/kəmˈpəʊnənt/', pos: 'n.', zh: ['组成部分；部件'], example: ['Each component of the system was tested.', '系统的每个组成部分都经过了测试。'], tags: ['托福'] },
  { term: 'contrast', phonetic: '/ˈkɒntrɑːst/', pos: 'n. / v.', zh: ['对比；对照'], example: ['The contrast between the two samples is striking.', '两个样本之间的对比非常明显。'], tags: ['托福'] },
  { term: 'core', phonetic: '/kɔː(r)/', pos: 'n. / adj.', zh: ['核心；核心的'], example: ['The core of the planet is extremely hot.', '行星的核心极热。'], tags: ['托福'] },
  { term: 'density', phonetic: '/ˈdensəti/', pos: 'n.', zh: ['密度'], example: ['Water density changes with temperature.', '水的密度随温度变化。'], tags: ['托福', '阅读'] },
  { term: 'deteriorate', phonetic: '/dɪˈtɪəriəreɪt/', pos: 'v.', zh: ['恶化；变坏'], example: ['Air quality deteriorated during the heatwave.', '热浪期间空气质量恶化。'], tags: ['托福'] },
  { term: 'ecosystem', phonetic: '/ˈiːkəʊsɪstəm/', pos: 'n.', zh: ['生态系统'], example: ['Coral reefs support a fragile ecosystem.', '珊瑚礁支撑着脆弱的生态系统。'], tags: ['托福', '阅读'] },
  { term: 'evolve', phonetic: '/ɪˈvɒlv/', pos: 'v.', zh: ['进化；演变'], example: ['Species evolve in response to pressure.', '物种在压力下进化。'], tags: ['托福'] },
  { term: 'external', phonetic: '/ɪkˈstɜːnl/', pos: 'adj.', zh: ['外部的；外来的'], example: ['External funding supported the project.', '外部资金支持了这个项目。'], tags: ['托福'] },
  { term: 'gradual', phonetic: '/ˈɡrædʒuəl/', pos: 'adj.', zh: ['逐渐的；渐进的'], example: ['The lake shows a gradual decline in depth.', '湖的深度逐渐下降。'], tags: ['托福'] },
  { term: 'internal', phonetic: '/ɪnˈtɜːnl/', pos: 'adj.', zh: ['内部的；内在的'], example: ['Internal pressure caused the chamber to crack.', '内部压力使腔体开裂。'], tags: ['托福'] },
  { term: 'mechanism', phonetic: '/ˈmekənɪzəm/', pos: 'n.', zh: ['机制；机械装置'], example: ['Researchers proposed a new mechanism for the reaction.', '研究者提出了该反应的新机制。'], tags: ['托福', '阅读'] },
  { term: 'sediment', phonetic: '/ˈsedɪmənt/', pos: 'n.', zh: ['沉积物；沉淀'], example: ['Layers of sediment record ancient climates.', '沉积层记录了古代气候。'], tags: ['托福', '听力'] },
  { term: 'transform', phonetic: '/trænsˈfɔːm/', pos: 'v.', zh: ['转变；改造'], example: ['The discovery transformed the field.', '这一发现改变了该领域。'], tags: ['托福'] },
];

/* ------------------------------ 商务 ------------------------------ */
const BUSINESS: SeedWord[] = [
  { term: 'agenda', phonetic: '/əˈdʒendə/', pos: 'n.', zh: ['议程；待办事项'], example: ['The agenda was sent before the meeting.', '议程在会前发送。'], tags: ['商务', '会议'] },
  { term: 'budget', phonetic: '/ˈbʌdʒɪt/', pos: 'n. / v.', zh: ['预算'], example: ['We need to keep the project within budget.', '我们需要让项目保持在预算内。'], tags: ['商务'] },
  { term: 'client', phonetic: '/ˈklaɪənt/', pos: 'n.', zh: ['客户；委托人'], example: ['The client approved the design on Friday.', '客户周五批准了设计。'], tags: ['商务'] },
  { term: 'deadline', phonetic: '/ˈdedlaɪn/', pos: 'n.', zh: ['截止日期'], example: ['The deadline for the proposal is next Monday.', '提案截止日期是下周一。'], mnemonic: 'dead + line：越过就"死"的线。', tags: ['商务'] },
  { term: 'delegate', phonetic: '/ˈdelɪɡeɪt/', pos: 'v. / n.', zh: ['委派；代表'], example: ['A good manager delegates routine tasks.', '好的管理者会委派日常任务。'], tags: ['商务', '管理'] },
  { term: 'invoice', phonetic: '/ˈɪnvɔɪs/', pos: 'n. / v.', zh: ['发票；开发票'], example: ['Please send the invoice to the finance team.', '请把发票发给财务团队。'], tags: ['商务'] },
  { term: 'logistics', phonetic: '/ləˈdʒɪstɪks/', pos: 'n.', zh: ['物流；后勤'], example: ['Logistics costs rose sharply last quarter.', '上季度物流成本大幅上升。'], tags: ['商务'] },
  { term: 'margin', phonetic: '/ˈmɑːdʒɪn/', pos: 'n.', zh: ['利润率；页边距；余地'], example: ['The product has a healthy profit margin.', '该产品有健康的利润率。'], tags: ['商务'] },
  { term: 'merge', phonetic: '/mɜːdʒ/', pos: 'v.', zh: ['合并；融合'], example: ['The two teams will merge next month.', '两个团队下个月合并。'], tags: ['商务'] },
  { term: 'milestone', phonetic: '/ˈmaɪlstəʊn/', pos: 'n.', zh: ['里程碑；重要节点'], example: ['Shipping the beta is a key milestone.', '发布测试版是一个关键里程碑。'], tags: ['商务', '管理'] },
  { term: 'negotiate', phonetic: '/nɪˈɡəʊʃieɪt/', pos: 'v.', zh: ['谈判；协商'], example: ['We are negotiating a lower price with the supplier.', '我们正在与供应商谈更低的价格。'], tags: ['商务'] },
  { term: 'outsource', phonetic: '/ˈaʊtsɔːs/', pos: 'v.', zh: ['外包'], example: ['They outsource customer support to a partner.', '他们把客服外包给合作方。'], tags: ['商务'] },
  { term: 'portfolio', phonetic: '/pɔːtˈfəʊliəʊ/', pos: 'n.', zh: ['作品集；投资组合'], example: ['Show three case studies in your portfolio.', '作品集里放三个案例。'], tags: ['商务'] },
  { term: 'proposal', phonetic: '/prəˈpəʊzl/', pos: 'n.', zh: ['提案；建议'], example: ['The proposal needs two more signatures.', '提案还需要两个签名。'], tags: ['商务'] },
  { term: 'recruit', phonetic: '/rɪˈkruːt/', pos: 'v. / n.', zh: ['招聘；新成员'], example: ['We plan to recruit two engineers.', '我们计划招两名工程师。'], tags: ['商务', 'HR'] },
  { term: 'revenue', phonetic: '/ˈrevənjuː/', pos: 'n.', zh: ['收入；营业额'], example: ['Revenue grew 12% year on year.', '收入同比增长 12%。'], tags: ['商务', '财务'] },
  { term: 'stakeholder', phonetic: '/ˈsteɪkhəʊldə(r)/', pos: 'n.', zh: ['利益相关者'], example: ['Every stakeholder received the update.', '每位利益相关者都收到了更新。'], tags: ['商务'] },
  { term: 'supplier', phonetic: '/səˈplaɪə(r)/', pos: 'n.', zh: ['供应商'], example: ['The supplier confirmed delivery on Tuesday.', '供应商确认周二交货。'], tags: ['商务'] },
  { term: 'turnover', phonetic: '/ˈtɜːnəʊvə(r)/', pos: 'n.', zh: ['营业额；人员流动率'], example: ['High staff turnover slows projects down.', '高人员流动拖慢项目。'], tags: ['商务'] },
  { term: 'venture', phonetic: '/ˈventʃə(r)/', pos: 'n. / v.', zh: ['风险项目；冒险'], example: ['The joint venture focuses on clean energy.', '这家合资企业专注清洁能源。'], tags: ['商务'] },
];

/* ------------------------------ 日常口语 ------------------------------ */
const DAILY: SeedWord[] = [
  { term: 'available', phonetic: '/əˈveɪləbl/', pos: 'adj.', zh: ['有空的；可用的'], example: ['Are you available for coffee tomorrow?', '你明天有空喝咖啡吗？'], tags: ['口语'] },
  { term: 'borrow', phonetic: '/ˈbɒrəʊ/', pos: 'v.', zh: ['借入'], example: ['Can I borrow your charger for a minute?', '我能借你的充电器用一下吗？'], tags: ['口语'] },
  { term: 'comfortable', phonetic: '/ˈkʌmftəbl/', pos: 'adj.', zh: ['舒服的；自在的'], example: ['This chair is really comfortable.', '这把椅子真舒服。'], tags: ['口语'] },
  { term: 'convenient', phonetic: '/kənˈviːniənt/', pos: 'adj.', zh: ['方便的；合适的'], example: ['Is 7 p.m. convenient for you?', '晚上 7 点对你方便吗？'], tags: ['口语'] },
  { term: 'definitely', phonetic: '/ˈdefɪnətli/', pos: 'adv.', zh: ['肯定；当然'], example: ["I'll definitely be there.", '我肯定会到。'], tags: ['口语'] },
  { term: 'exhausted', phonetic: '/ɪɡˈzɔːstɪd/', pos: 'adj.', zh: ['精疲力尽的'], example: ["I'm exhausted after the night shift.", '夜班之后我累坏了。'], tags: ['口语'] },
  { term: 'favor', phonetic: '/ˈfeɪvə(r)/', pos: 'n. / v.', zh: ['恩惠；帮忙；偏爱'], example: ['Could you do me a favor?', '能帮我个忙吗？'], tags: ['口语'] },
  { term: 'gorgeous', phonetic: '/ˈɡɔːdʒəs/', pos: 'adj.', zh: ['美极了的；极好的'], example: ['The view from the roof is gorgeous.', '屋顶的景色美极了。'], tags: ['口语'] },
  { term: 'grab', phonetic: '/ɡræb/', pos: 'v.', zh: ['抓取；匆匆吃点'], example: ["Let's grab a bite before the movie.", '看电影前随便吃点吧。'], tags: ['口语'] },
  { term: 'grocery', phonetic: '/ˈɡrəʊsəri/', pos: 'n.', zh: ['食品杂货'], example: ['I need to pick up groceries after work.', '下班后我得买点菜。'], tags: ['口语'] },
  { term: 'invite', phonetic: '/ɪnˈvaɪt/', pos: 'v.', zh: ['邀请'], example: ['She invited us over for dinner.', '她请我们过去吃晚饭。'], tags: ['口语'] },
  { term: 'lend', phonetic: '/lend/', pos: 'v.', zh: ['借出'], example: ['Could you lend me a pen?', '能借我支笔吗？'], tags: ['口语'] },
  { term: 'neighborhood', phonetic: '/ˈneɪbəhʊd/', pos: 'n.', zh: ['社区；街区'], example: ["There's a nice bakery in the neighborhood.", '附近有家不错的面包店。'], tags: ['口语'] },
  { term: 'prefer', phonetic: '/prɪˈfɜː(r)/', pos: 'v.', zh: ['更喜欢'], example: ['I prefer tea to coffee in the morning.', '早上我更喜欢茶而不是咖啡。'], tags: ['口语'] },
  { term: 'relax', phonetic: '/rɪˈlæks/', pos: 'v.', zh: ['放松'], example: ['I relax by walking by the river.', '我在河边散步来放松。'], tags: ['口语'] },
  { term: 'schedule', phonetic: '/ˈʃedjuːl/', pos: 'n. / v.', zh: ['日程；安排'], example: ['My schedule is packed this week.', '这周日程排满了。'], tags: ['口语'] },
  { term: 'snack', phonetic: '/snæk/', pos: 'n.', zh: ['零食；小吃'], example: ["Let's bring some snacks for the trip.", '带点零食路上吃吧。'], tags: ['口语'] },
  { term: 'terrific', phonetic: '/təˈrɪfɪk/', pos: 'adj.', zh: ['极好的'], example: ['That sounds terrific!', '听起来棒极了！'], tags: ['口语'] },
  { term: 'weird', phonetic: '/wɪəd/', pos: 'adj.', zh: ['奇怪的'], example: ["It's weird that the lights are still on.", '灯还亮着，有点奇怪。'], tags: ['口语'] },
  { term: 'commute', phonetic: '/kəˈmjuːt/', pos: 'v. / n.', zh: ['通勤'], example: ['I commute by subway every day.', '我每天坐地铁通勤。'], tags: ['口语'] },
];

/* ------------------------------ 科技热词 ------------------------------ */
const TECH: SeedWord[] = [
  { term: 'algorithm', phonetic: '/ˈælɡərɪðəm/', pos: 'n.', zh: ['算法'], example: ['The feed is ranked by a recommendation algorithm.', '信息流由推荐算法排序。'], tags: ['科技', 'AI'] },
  { term: 'automation', phonetic: '/ˌɔːtəˈmeɪʃn/', pos: 'n.', zh: ['自动化'], example: ['Automation is changing entry-level jobs.', '自动化正在改变入门级岗位。'], tags: ['科技'] },
  { term: 'blockchain', phonetic: '/ˈblɒktʃeɪn/', pos: 'n.', zh: ['区块链'], example: ['The certificate is stored on a blockchain.', '证书存储在区块链上。'], tags: ['科技'] },
  { term: 'chatbot', phonetic: '/ˈtʃætbɒt/', pos: 'n.', zh: ['聊天机器人'], example: ['The chatbot answers questions about billing.', '聊天机器人回答账单问题。'], tags: ['科技', 'AI'] },
  { term: 'cybersecurity', phonetic: '/ˌsaɪbəsɪˈkjʊərəti/', pos: 'n.', zh: ['网络安全'], example: ['Cybersecurity training is now mandatory.', '网络安全培训现在是强制的。'], tags: ['科技'] },
  { term: 'dataset', phonetic: '/ˈdeɪtəset/', pos: 'n.', zh: ['数据集'], example: ['The model was trained on an open dataset.', '该模型在公开数据集上训练。'], tags: ['科技', 'AI'] },
  { term: 'encryption', phonetic: '/ɪnˈkrɪpʃn/', pos: 'n.', zh: ['加密'], example: ['End-to-end encryption protects your messages.', '端到端加密保护你的消息。'], tags: ['科技'] },
  { term: 'generative', phonetic: '/ˈdʒenərətɪv/', pos: 'adj.', zh: ['生成式的'], example: ['Generative tools can draft code quickly.', '生成式工具能快速起草代码。'], tags: ['科技', 'AI'] },
  { term: 'infrastructure', phonetic: '/ˈɪnfrəstrʌktʃə(r)/', pos: 'n.', zh: ['基础设施'], example: ['The cloud infrastructure runs in three regions.', '云基础设施在三个区域运行。'], tags: ['科技'] },
  { term: 'innovation', phonetic: '/ˌɪnəˈveɪʃn/', pos: 'n.', zh: ['创新'], example: ['Open data often drives innovation.', '开放数据常推动创新。'], tags: ['科技'] },
  { term: 'latency', phonetic: '/ˈleɪtənsi/', pos: 'n.', zh: ['延迟；潜伏期'], example: ['Low latency matters for live translation.', '低延迟对实时翻译很重要。'], tags: ['科技'] },
  { term: 'malware', phonetic: '/ˈmælweə(r)/', pos: 'n.', zh: ['恶意软件'], example: ['The malware spread through phishing emails.', '恶意软件通过钓鱼邮件传播。'], tags: ['科技', '安全'] },
  { term: 'neural', phonetic: '/ˈnjʊərəl/', pos: 'adj.', zh: ['神经的；神经网络的'], example: ['The system uses a neural network.', '该系统使用神经网络。'], tags: ['科技', 'AI'] },
  { term: 'platform', phonetic: '/ˈplætfɔːm/', pos: 'n.', zh: ['平台'], example: ['Creators publish on several platforms.', '创作者在多个平台发布内容。'], tags: ['科技'] },
  { term: 'privacy', phonetic: '/ˈprɪvəsi/', pos: 'n.', zh: ['隐私'], example: ['The update adds better privacy controls.', '这次更新增加了更好的隐私控制。'], tags: ['科技'] },
  { term: 'quantum', phonetic: '/ˈkwɒntəm/', pos: 'adj.', zh: ['量子的'], example: ['Quantum computers may break current encryption.', '量子计算机可能破解现有加密。'], tags: ['科技'] },
  { term: 'robotics', phonetic: '/rəʊˈbɒtɪks/', pos: 'n.', zh: ['机器人技术'], example: ['Robotics is reshaping warehouses.', '机器人技术正在重塑仓储。'], tags: ['科技'] },
  { term: 'scalable', phonetic: '/ˈskeɪləbl/', pos: 'adj.', zh: ['可扩展的'], example: ['We need a scalable architecture.', '我们需要可扩展的架构。'], tags: ['科技'] },
  { term: 'sustainable', phonetic: '/səˈsteɪnəbl/', pos: 'adj.', zh: ['可持续的'], example: ['Sustainable design reduces long-term costs.', '可持续设计降低长期成本。'], tags: ['科技', 'ESG'] },
  { term: 'virtual', phonetic: '/ˈvɜːtʃuəl/', pos: 'adj.', zh: ['虚拟的'], example: ['The team meets in a virtual office.', '团队在虚拟办公室开会。'], tags: ['科技'] },
];

export const EXTRA_DECK_SEEDS: ExtraDeckSeed[] = [
  { deck: deck('deck-gaokao-demo', '高考核心演示词书', 'GAOKAO', '覆盖高中阶段高频动词、名词与写作常用词。', GAOKAO.length), prefix: 'gk', words: GAOKAO },
  { deck: deck('deck-kaoyan-demo', '考研核心演示词书', 'KAOYAN', '偏学术阅读与论证写作，适合考研英语打底。', KAOYAN.length), prefix: 'ky', words: KAOYAN },
  { deck: deck('deck-ielts-demo', '雅思学术演示词书', 'IELTS', '小作文数据描述 + 大作文论证常用词。', IELTS.length), prefix: 'ie', words: IELTS },
  { deck: deck('deck-toefl-demo', '托福学术演示词书', 'TOEFL', '自然科学与讲座场景高频学术词。', TOEFL.length), prefix: 'tf', words: TOEFL },
  { deck: deck('deck-business-demo', '商务职场演示词书', 'BUSINESS', '会议、财务、招聘与项目管理场景。', BUSINESS.length), prefix: 'bz', words: BUSINESS },
  { deck: deck('deck-daily-demo', '日常口语演示词书', 'DAILY', '生活口语高频表达，适合碎片时间。', DAILY.length), prefix: 'dl', words: DAILY },
  { deck: deck('deck-tech-demo', '科技与 AI 热词演示词书', 'TECH', '算法、隐私、生成式 AI 等近年高频新词。', TECH.length), prefix: 'tc', words: TECH },
];
