# WordFlow

本地优先的英语背单词 PWA：主动回忆 + FSRS 兼容间隔重复 + 错词重练 + 可导入词书。

**当前阶段：第一阶段（纯本地）**。没有账号、没有云同步、没有真实排行榜、没有内置官方 CET 词库。

---

## 1. 快速开始

```bash
cd wordflow
npm install
npm run dev          # http://localhost:5173
```

生产构建与预览（PWA / Service Worker 只在构建产物中生效）：

```bash
npm run build        # 生成图标 + tsc --noEmit + vite build
npm run preview      # http://127.0.0.1:4173（显式绑定 IPv4，便于 Playwright 探测）
```

测试：

```bash
npm run lint
npm run typecheck
npm run test         # Vitest + React Testing Library
npm run test:e2e     # Playwright（自动启动 preview，桌面 + 移动两个项目）
npx playwright install chromium   # 首次运行 E2E 前
```

> 若 `registry.npmjs.org` 不可达，项目已带 `.npmrc` 指向 npmmirror；换网络后删除该文件即回到官方源。

---

## 2. 项目结构

```
wordflow/
├─ e2e/                       Playwright 端到端测试
│  ├─ study.spec.ts           学习闭环 / 路由 / 键盘 / 响应式 / 空状态
│  └─ data.spec.ts            CSV 导入、备份恢复、PWA 离线
├─ public/
│  ├─ favicon.svg
│  ├─ icons/                  PWA 图标（脚本生成的真实 PNG）
│  └─ wordflow-sample.csv     导入模板
├─ scripts/generate-icons.mjs 无依赖 PNG 生成器
├─ src/
│  ├─ components/
│  │  ├─ AppLayout.tsx        侧边导航 + 底部导航 + 离线横条
│  │  ├─ StudyCard.tsx        纯展示学习卡（可单测）
│  │  └─ ui.tsx               PageHeader/StatCard/ProgressBar/Toast…
│  ├─ hooks/
│  │  ├─ useSnapshot.ts       Dexie liveQuery 快照 + 词书汇总
│  │  ├─ useStudySession.ts   会话循环（恢复/提交/结束时汇总）
│  │  ├─ usePronunciation.ts  SpeechSynthesis 封装
│  │  └─ useOnlineStatus.ts
│  ├─ lib/
│  │  ├─ scheduler/           ★ 调度算法（纯函数，可注入时钟）
│  │  ├─ study/               计划构建、短时重练队列、会话状态机
│  │  ├─ stats/               从 ReviewLog 重算统计、连续天数、等级
│  │  ├─ data/
│  │  │  ├─ repository.ts     DataProvider 抽象 + commitReview + 导入 + 备份
│  │  │  └─ backup.ts         备份结构校验（恢复前全量检查）
│  │  ├─ db/                  Dexie schema、种子数据、启动引导
│  │  ├─ import/              CSV/JSON 解析、校验、导出
│  │  ├─ audio/               发音 Provider 接口
│  │  ├─ ai/                  AI 服务接口 + 返回内容校验
│  │  ├─ settings/            localStorage 设置 + 主题
│  │  ├─ types.ts             全部领域类型
│  │  └─ time.ts              时钟、本地日期键
│  ├─ pages/                  Dashboard/Study/Review/Mistakes/Decks/Stats/Leaderboard/Settings
│  ├─ providers/              AppProvider（设置 + Toast）
│  └─ test/setup.ts           jsdom + fake-indexeddb
├─ playwright.config.ts
├─ tailwind.config.js
└─ vite.config.ts             VitePWA（generateSW + 预缓存）
```

---

## 3. 已实现功能

### 学习闭环
- 开始前有**学习计划页**：选练习方式、时间预算、参与词书，并实时预览「本节 = N 复习 + M 新词 · 约 X 分钟」。
- 四种**真实练习模式**（不是占位）：
  - **英译中**：看英文回忆中文释义
  - **中译英**：看中文回忆英文单词
  - **纯拼写**：看中文逐字母拼出单词，自动判分（含编辑距离判定，轻微拼错会提示"只差一点"）
  - **选择题**：从 4 个释义中选出正确项，干扰项从同词书其它单词中确定性抽取
- 拼写/选择题会给出判分横幅，并按对错**建议**「认识 / 忘记」；最终仍由学习者自己决定，保证算法输入真实。
- 每次评分后显示「下次复习 X 天后（state）」，让间隔重复的调度结果可见，而不是黑箱。
- 键盘操作：`空格/Enter` 翻卡，`1/2/3` 评价，`S` 发音；焦点环可见。
- 可开启**自动发音**（设置中），进入新卡时自动朗读。
- 暂停 / 退出 / 刷新后可从首页或计划页「继续上次」恢复未完成会话（12 小时内）。
- 会话内短时重练队列与跨天长期队列分离：答错词至少间隔 2 张卡才重现，绝不连续重复。

### 调度算法（`src/lib/scheduler`）
- FSRS-4.5 兼容的自实现版本 `wf-fsrs-4.5-lite`，使用公开默认权重，**不是官方 FSRS 库**，也未经真实复习历史校准。
- 四个状态：`new → learning/review → relearning → review`；难度、稳定度、可提取性按 FSRS 公式更新。
- 认识/模糊/忘记分别映射 grade 3/2/1；learning 与 relearning 阶段用分钟级步长，正常复习用天级间隔。
- 全部参数集中在 `DEFAULT_ALGORITHM_CONFIG`，算法版本写入每个 `UserWordState` 和 `ReviewLog`。
- 时间全部通过 `now` 参数注入 → 单元测试可重复（20 个调度测试）。
- 每日新词上限、复习上限、时间预算（按每卡 20 秒估算）在 `buildSessionPlan` 中生效；复习压力大时新词减半。

### 错词本
- 「忘记」立即入本；连续 2 次「模糊」或累计 2 次遗忘也会入本；可手动收藏/移出。
- 展示错误次数、最近错误时间、当前记忆状态、下次复习；可查看该词的完整复习历史。
- 按词书筛选、按错误次数/最近/连续模糊排序；「只练薄弱词」启动独立会话。
- 错词复习更新同一条 `UserWordState`（`wordId` 唯一索引），不产生冲突副本。

### 词书与导入
- 目录、内置词书、搜索筛选与质量指标见下方「词书中心」。
- **统一字段**：`term`、`normalizedTerm`、`phoneticUS`、`phoneticUK`、`partOfSpeech`、`definitions`、`examples`、`translations`、`audioUS`、`audioUK`、`source`、`licenseNote`、`tags`。
- **分批导入**：每批 200 行独立事务，导入弹窗显示真实进度（`done/total`），5000 行也不会锁死页面。
- **去重策略**：文件内重复与库内已存在都在预览阶段报告；已存在的词只做关联，不新建、不覆盖，因此**记忆状态与复习计划永不被重置**。
- 导入前弹窗预览：有效行、错误行（含行号与原因）、重复词；确认后写入，写入后可按批次撤销（该批词已产生学习记录则拒绝）。
- `audioUS/audioUK` 只接受 `http(s)` 或 `/` 开头的站内路径，非法值被丢弃而不是存进去当坏 URL。
- 单词可属多本词书，但记忆状态按 `wordId` 唯一。
- 支持把整本词书导出为 CSV（含音频列）。

### 词书中心
- 10 类目录（CET-4/CET-6/考研/高考/初高中/雅思/托福/GRE/商务/自定义），**没有数据的分类显示「尚未导入」而不是编造词数**。
- **内置 8 本完整考试词书 + 9 本手写示例词书，共 17 本、14,863 个唯一词条、38,745 条词书关联**：

  | 词书 | 分类 | 真实词数 | 来源 |
  | --- | --- | --- | --- |
  | 中考核心词 | 初中 | 1,598 | ECDICT（MIT） |
  | 高考核心词 | 高考 | 3,666 | ECDICT（MIT） |
  | CET-4 四级词表 | 四级 | 3,844 | ECDICT（MIT） |
  | CET-6 六级词表 | 六级 | 5,401 | ECDICT（MIT） |
  | 考研英语词表 | 考研 | 4,796 | ECDICT（MIT） |
  | 雅思词表 | 雅思 | 5,020 | ECDICT（MIT） |
  | 托福词表 | 托福 | 6,936 | ECDICT（MIT） |
  | GRE 词表 | GRE | 7,484 | ECDICT（MIT） |

  另有 9 本手写示例词书（196 词），带例句与助记，用于体验完整学习流程。
- **来源与许可**：词表与中文释义来自 [ECDICT](https://github.com/skywind3000/ECDICT)（MIT License），按考试标签（`zk/gk/cet4/cet6/ky/ielts/toefl/gre`）拆分。**不是官方考纲全集**，数量与官方大纲存在差异，页面已如实标注。
- **词表按需加载**：每本词书是独立 chunk（`src/lib/db/decks/*.ts`），首屏主包仅 ~191 KB；PWA 只预缓存外壳（660 KB），词书与发音音频走运行时缓存。
- **全局去重**：`words.normalizedTerm` 唯一，8,695 个跨词书重复的词只存一份，通过 `deckWords` 关联多本书——四级和六级共享同一个 `abandon`，学习进度也只有一份。
- 支持搜索（名称/描述/来源）、按分类筛选、按词数/进度/缺音频排序。
- 每本词书显示：总词数、已学习、待学习、已掌握、到期数、**缺录音/缺音标/缺释义/缺例句**、来源、授权、更新时间。
- 词书可删除（保留已学词的记忆记录），演示词书删除后不会被种子迁移加回。
- **备份只包含用户数据**：内置词书可由种子重建，导出不再携带 1.4 万词（实测 324 ms，此前会超时）。

### 统计 / 打卡 / 经验 / 徽章
- 今日学习、累计学习（去重）、复习次数、正确回忆率、遗忘次数、连续打卡、学习时长、目标完成率。
- 近 7 / 30 天趋势柱状图、词书进度、薄弱词分布。
- 每日统计由 `ReviewLog` + 会话时长**重算**，每天一条 `dateKey` 记录，重复提交不会重复累计。
- 打卡按本地日期键（`YYYY-MM-DD`）计算，跨午夜与时区变化由 `toDateKey` 处理。
- 经验值：认识 4（新词 +3）/ 模糊 2 / 忘记 1；等级按累计 XP 递增；7 个徽章按真实指标解锁且只解锁一次。

### 发音
- **三级回退**（`src/lib/audio/pronunciationService.ts`）：
  1. 词条自带录音 `audioUS` / `audioUK`（真实 URL，`<audio>` 播放，失败自动降级）
  2. 浏览器 SpeechSynthesis（系统语音，最自然；按 accent 优先 en-US / en-GB）
  3. **内置共振峰合成**（`fallbackSynth.ts`，Web Audio）——系统没装英语语音包时仍能出声
- 处理了 Chrome `getVoices()` 首帧为空（等 `voiceschanged` + 轮询兜底）、播放被拒、超时、URL 失效、CORS。
- 每张卡有「发音」与「慢速」两个按钮；慢速对 TTS 改 `rate=0.55`、对录音改 `playbackRate=0.75`、对内置合成延长时长。
- 连续点击先 `cancel()` 再播放，不叠加声音。
- 全局设置：英音/美音、正常/慢速、自动播放（**默认关闭**）、是否优先录音。
- 结果**如实上报**：显示"录音 / 系统语音 / 内置合成"、实际 voice 名与语言，失败显示具体原因，绝不谎报成功。
- 独立诊断页 `/pronunciation`：选词条、口音、来源，显示真实 voice 数量与最近结果。详见 [发音验证记录](docs/pronunciation-verification.md)。

### 词书中心
- 目录、完整考试词表、来源与许可、按需加载与去重策略见上方「词书中心」章节。

### AI 例句（可选）
- `AiService` 接口 + 服务端代理约定（`VITE_AI_PROXY_URL`）；前端不保存任何 API Key。
- 未配置时：卡片显示"记忆提示：待生成"，其余功能完全正常。
- 返回内容经 `validateAiPayload` 校验（wordId 匹配、长度、含英文）后才写库。
- 设置页提供"生成测试"按钮，会如实显示未配置。

### 数据管理
- JSON 全量备份（单词/词书/关联/记忆状态/日志/会话/统计/徽章/AI 缓存/导入批次）。
- 恢复前全量校验：结构、版本、单词 id 唯一、引用完整性、同一词重复状态；失败时原数据完全不动。
- 单词语料 CSV 导入 / 导出；整库清空需二次确认。
- 所有页面显示"仅本地保存"，排行榜明确说明没有真实排名。

### PWA / 响应式 / 可访问性
- `vite-plugin-pwa` generateSW：预缓存 37 个资源，离线可启动，已保存单词与记录可继续学习。
- Manifest：standalone、192/512/maskable 图标、主题色；可安装。
- 桌面端侧边导航 + 主区域 + 右侧统计；移动端底部 5 项导航（单手可达）、卡片自适应 360px。
- 无横向溢出（E2E 在 360px 逐页断言）。
- 学习卡右上角可手动收藏（写入同一条 `UserWordState`），收藏词出现在错词本并计入「只练薄弱词」。

---

## 4. 未实现 / 已知限制

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 云端账号、跨设备同步 | 未实现 | 仅预留 `userId`、`schemaVersion` 等字段与 `DataProvider` 抽象 |
| 真实排行榜 | 未实现 | 仅本地演示，显示"等待云端用户系统"占位，不伪造用户 |
| AI 例句实际生成 | 需自建代理 | 未配置 `VITE_AI_PROXY_URL` 时不生成，卡片显示"待生成" |
| 纯拼写 / 选择题模式 | 仅保存偏好 | 设置中标注"规划中"，不提供未完成的输入校验 |
| 正式 CET-4/CET-6 全量词库 | 未内置 | 演示数据为手写原创，需自行导入合法来源词表 |
| 音频文件 / 云 TTS | 未接入 | 当前只用浏览器 SpeechSynthesis |
| 算法校准 | 未做 | 使用公开默认权重，未用真实复习历史优化参数 |
| 多用户 / 权限 | 未实现 | 单浏览器单用户 |

---

## 5. 数据备份与恢复

**导出**：设置 → 数据与备份 → 「导出 JSON 备份」。文件名 `wordflow-backup-YYYY-MM-DD.json`，包含全部表。

**恢复**：选择文件或粘贴 JSON → 「预览校验」→ 看到单词/词书/状态/日志/会话数量后 → 「覆盖恢复」。

- 校验失败（结构损坏、引用缺失、同一词重复状态、非 WordFlow 文件）时按钮禁用，**现有数据不会被修改**。
- 恢复在一个 Dexie 事务中先清空再写入；成功后统计会从日志自然重算。
- 覆盖恢复会替换整个数据库，建议先导出当前备份。

---

## 6. 如何导入完整 CET-4 / CET-6 词库

完整词库**不在仓库里**——本应用不打包任何商业词库。导入流程如下：

### 6.1 准备数据

只使用你有权使用的词表（学校讲义、已购买授权的词表、开放许可词表、或自建）。整理成 CSV（UTF-8，可带 BOM）：

```csv
term,phoneticUS,phoneticUK,partOfSpeech,definitions,exampleEn,exampleZh,audioUS,audioUK,tags,source,licenseNote
abandon,/əˈbændən/,/əˈbændən/,v.,"放弃，抛弃;离弃",They had to abandon the plan.,他们不得不放弃这个计划。, , ,高频;动词,学校讲义,内部授权
```

规则：

- `definitions` 用 `;` 分隔多义项；`tags` 用 `;` 或 `,`。
- `exampleEn` 与 `exampleZh` 必须成对出现或同时留空。
- `audioUS/audioUK` 可留空（留空则用系统语音/内置合成）；填就必须是 `https://...` 或 `/audio/xxx.mp3`。
- `source` / `licenseNote` 会原样存到每个词，便于日后审计。
- 只有 `term` 与 `definitions` 是必需的，其余列可省略。

JSON 等价格式（数组或 `{ "words": [...] }`）：

```json
{
  "words": [
    {
      "term": "abandon",
      "phoneticUS": "/əˈbændən/",
      "phoneticUK": "/əˈbændən/",
      "partOfSpeech": "v.",
      "definitions": ["放弃，抛弃"],
      "translations": ["abandon a plan 放弃计划"],
      "examples": [{ "en": "They abandoned the plan.", "zh": "他们放弃了计划。" }],
      "audioUS": null,
      "audioUK": null,
      "tags": ["高频"],
      "source": "学校讲义",
      "licenseNote": "内部授权"
    }
  ]
}
```

### 6.2 导入步骤

1. 打开 `/decks` → 「新建词书」→ 分类选「四级」或「六级」→ 填来源与授权。
2. 在该词书卡片点「导入」→ 选择 CSV/JSON。
3. 预览里核对：**有效行 / 错误行（带行号与原因）/ 重复词**。
4. 点「确认导入 N 词」。大文件按每批 200 行写入，进度条显示真实 `done/total`。
5. 导入完成后可在「导入记录」撤销（若该批词已产生学习记录则拒绝，保护你的复习数据）。
6. 想更新词库：导出该词书 CSV → 修改 → 再次导入同一本词书。已存在的词会被**跳过并复用**，不会重置学习进度。

### 6.3 一个词库要多久

| 词库规模 | 本机实测 |
| --- | --- |
| 100 行 | 约 0.1–0.3 秒，进度条 1 次回调（batchSize 200 时一次写完） |
| 5,000 行 | 约 25 个批次，页面保持可交互 |

> 超过 2 万行建议先按分类拆成多个词书，便于单独开关与统计。

示例模板：[wordflow-sample.csv](public/wordflow-sample.csv) · [wordflow-sample.json](public/wordflow-sample.json)（原创内容，CC BY 4.0）。

---

## 7. 后续云端 / 排行榜 / AI 接入方案

### 7.1 数据层替换
`src/lib/data/repository.ts` 已定义 `DataProvider` 接口（`initialize / listDecks / listWordsByDeck / createDeck`），页面通过 hooks 访问数据。接入云端时：

1. 新增 `CloudDataProvider`（REST/GraphQL + Bearer token），保持相同方法签名。
2. 在 `main.tsx` 依据登录状态选择 provider；本地 IndexedDB 保留为离线缓存。
3. 同步策略：以 `ReviewLog.eventId` 作为幂等键服务端去重；`updatedAt` + 软删除标记做冲突解决；`UserWordState` 以 `wordId` 唯一，服务端按最后写入合并。
4. 迁移：`meta.schemaVersion` 驱动迁移脚本；换算法时用 `algorithmVersion` 标记并按需重算 `nextReviewAt`。

### 7.2 账号与安全
- 真实认证（邮箱验证码 / OAuth），服务端签发 httpOnly session 或短期 JWT。
- 服务端数据库（Postgres + 行级权限），客户端只拿到自己的数据。
- 所有写入经服务端校验：rating 合法性、时间戳合理性、速率限制、异常检测（防刷经验）。
- **API Key 只在服务端环境变量**；前端构建产物不得包含任何密钥。

### 7.3 真实排行榜
1. 服务端按日/周窗口聚合 `xpEarned`（由服务端重算，不接受客户端上报的绝对值）。
2. 防作弊：事件级幂等、时间分布异常检测、单日上限、设备指纹与信誉分。
3. 明确榜单口径（同词书/全站、日榜/周榜）与隐私开关（匿名昵称）。
4. 前端把当前 `Leaderboard.tsx` 的占位区替换为真实查询；本地模式继续保留"无真实排名"提示。

### 7.4 AI 例句服务
- 自建代理（Node/Edge Function）：`POST /generate-example`，入参 `{ wordId, term, definitions }`。
- 代理侧：服务商密钥、提示词模板、超时 15s、指数退避重试、每用户每日限额、内容过滤。
- 返回 `{ wordId, sentence, sentenceZh, mnemonic }`；前端 `validateAiPayload` 已做 id 匹配与长度校验。
- 生成结果写入 `aiExamples` 表缓存，避免重复计费；卡片优先展示本地词条内容，其次 AI 缓存，最后显示"待生成"。
- 上线前补充：未成年人内容策略、生成内容标识、失败降级与计费监控。

---

## 8. 算法说明（可审计）

文件：`src/lib/scheduler/index.ts`

```
state=null           → 认识: review + interval(stability)
                       模糊: learning + 10min
                       忘记: learning + 3min, lapse+1
state=learning/relearning → 短时稳定度更新，认识则毕业到 review（≥1 天）
state=review         → 认识/模糊: 稳定度增长 + 间隔（模糊 ×0.6）
                       忘记: stability_f = w11·D^-w12·((S+1)^w13-1)·e^(w14·(1-R))
                             → relearning + 10min, lapse+1
```

- 可提取性：`R(t,S) = (1 + 19/81 · t/S)^(-0.5)`
- 间隔：`I = S/FACTOR · (targetRetention^(1/DECAY) - 1)`，clamp 到 `[1, 3650]` 天。
- 参数：`DEFAULT_ALGORITHM_CONFIG.weights`（19 个公开默认权重）、`desiredRetention=0.9`。
- 测试覆盖：首次学习三档差异、正常复习增长、模糊早于认识、遗忘降级重学、多次遗忘、时间边界（恰好在 due 时刻）、可提取性衰减、错词本规则、`1/3/7/15` 阶梯反例。

---

## 9. 真实验证结果

在 Windows 11 / Node v24.20.0 上实际执行：

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | 通过，0 error / 0 warning（`--max-warnings=0`） |
| `npm run typecheck` | 通过（`strict: true`，含测试与 e2e 目录） |
| `npm run test` | **7 个测试文件 / 93 个测试全部通过** |
| `npm run build` | 通过，`dist` 约 0.6 MB，PWA 预缓存 37 项 |
| `npm run test:e2e` | **30 个 E2E 全部通过**（桌面 1440px + 移动 Pixel 7 两个项目） |
| `npm run dev` | 启动正常，`http://localhost:5173` 返回 200 |

单元测试分布：调度器 20、会话/队列 13、统计 16、导入 11、仓库层（含幂等、备份、撤销）14、服务与设置 10、StudyCard 组件 9。

E2E 覆盖：学习闭环持久化、刷新恢复、错词本自动收录、「只练薄弱词」、收藏、键盘操作、设置持久化与深色模式、全部 8 条路由、排行榜无伪造数据、CSV 导入预览/错误/重复/撤销、JSON 备份导出与恢复、损坏文件不破坏数据、Service Worker 离线启动、Manifest 可安装、360px 无横向溢出。

截图见 `shots/`（`final-dashboard.png`、`final-study.png`、`final-stats.png`、`final-mobile.png` 等）。
