# 发音验证记录

本文记录**实际执行**的验证，以及**仅完成代码兼容处理、未实测**的部分。后者不会被写成"通过"。

## 一、实现机制

发音走 `src/lib/audio/pronunciationService.ts` 里的 `BrowserPronunciationService`，**三级回退**：

```
speak(word, {accent, speed, preferRecordedAudio})
  │
  ├─ 1. 词条有 audioUS / audioUK（真实 URL）
  │     └─ <audio> 播放；失败 → 记录原因 → 第 2 步
  │
  ├─ 2. SpeechSynthesis（系统语音，最自然）
  │     ├─ ensureVoices()  等待 voiceschanged（Chrome 首次为空）
  │     ├─ 按 accent 优先 en-US / en-GB，其次任意英语语音（标记 usedFallbackVoice）
  │     ├─ utterance.rate = 0.95 / 慢速 0.55
  │     └─ 失败 → 第 3 步
  │
  └─ 3. 内置共振峰合成（fallbackSynth.ts，Web Audio）
        ├─ 把字母转成元音/辅音序列，元音用双共振峰振荡器，辅音用带通噪声
        ├─ 慢速 rate 0.6
        └─ 保证"系统没装英语语音包"时也能出声
```

第 3 级是**实测发现必要**后加的：本机 Windows 只有 3 个中文语音、0 个英语语音，
只靠系统语音就是彻底没声音。加入内置合成后，真实浏览器验证到创建了 1 个
AudioContext、6 个振荡器，并上报"已播放 · 内置合成"。

关键点：

- **不构造 URL**。`audioUS/audioUK` 只来自导入数据，`sanitizeAudioUrl()` 只接受 `http(s)` 与 `/` 开头的站内路径。
- **不谎报成功**。只有 `play()` resolve、或 `utterance.onstart→onend`、或合成器真的排了振荡器，才算 `ok: true`；否则返回错误码
  （`no-synthesis` / `no-voices` / `audio-error` / `audio-timeout` / `not-allowed` / `aborted` / `unknown`）。
- **不叠加声音**。每次 `speak()` 先 `stop()`（pause audio + `speechSynthesis.cancel()`）。
- **慢速真实生效**：TTS 改 `rate`；录音改 `playbackRate = 0.75`；内置合成改 `rate`（更长时长）。
- **诚实标注音质**：走内置合成时 UI 明确写"内置合成（音质有限）"，不冒充系统语音。

## 二、单元测试（真实执行）

`src/lib/audio/*.test.ts`，26 个用例，全部通过。

**pronunciationService（17）**

| 场景 | 断言 |
| --- | --- |
| Chrome 首次 `getVoices() === []` | 等 `voiceschanged` 后仍能发声（不再误判"无语音"） |
| 设备没有英语语音 | 不谎报成功：`ok:false` 且带具体原因（浏览器不支持时）；支持时走内置合成 |
| en-US / en-GB 选择 | `voiceLang` 对应，且用对了 voice |
| 只有 en-US 但要英音 | 回退 + `usedFallbackVoice: true` |
| 慢速 | 捕获到 `rate === 0.55`，且小于正常的 0.95 |
| 连续两次播放 | 先 `cancel()`，不叠加 |
| 有录音 | `source: 'recorded'`，不触发 TTS |
| 录音 URL 失败 | 自动回退 TTS，`reason` 说明"已改用系统语音" |
| 关闭"优先录音" | 直接走 TTS，不创建 Audio |
| 环境上报 | 空列表时 `voicesLoaded: false` |

**fallbackSynth（9）**

| 场景 | 断言 |
| --- | --- |
| 无 Web Audio | `ok:false` + 说明，不假装播放 |
| 正常单词 | 真的创建 ≥4 个振荡器 + ≥2 段噪声，并 start/stop |
| 慢速 | 时长更长 |
| 播放结束 | AudioContext 被 close，不泄漏 |
| 空词 | 拒绝并给出原因 |
| 字母→音素 | 词尾静音 e 被丢弃，标点/数字被忽略 |

## 三、端到端（真实执行）

`e2e/pronunciation.spec.ts`，12 个用例，Chromium 全部通过：

- 发音测试页显示四个实测指标，播放前显示"尚未播放"
- 点击播放后要么出现"已播放 · 来源 TTS/录音"，要么出现具体错误——不会静默
- 注入 rate 探针后，慢速确实以 0.55 发起
- 切英音后请求与结果都反映 UK（或明确提示回退）
- 连点三次：`cancel()` ≥ 2 次，`speak()` ≤ 3 次
- 学习卡有"播放 X 的发音"与"慢速播放 X 的发音"两个可访问标签
- 设置页英音 + 慢速可持久化，刷新后仍为 `aria-pressed=true`

## 四、浏览器实测状态

| 平台 | 状态 | 说明 |
| --- | --- | --- |
| Windows 11 · Chromium 156（Playwright headless） | **已实测（程序化）** | 语音列表可加载（本机仅 3 个中文语音）、`speak()` 被调用、rate 正确、cancel 生效；无英语语音时实测走到内置合成，创建 1 个 AudioContext + 6 个振荡器。**headless 无声卡，未验证真实听感。** |
| Windows 11 · Chrome 桌面（有头） | **未实测** | 本机缺英语语音包，会走内置合成；需人工点一次确认音箱出声 |
| Windows 11 · Edge 桌面 | **未实测** | 同上 |
| Android Chrome | **未实测** | 代码已处理：首次播放需用户手势；`voiceschanged` 异步加载；无英语语音时用内置合成 |
| iOS Safari | **未实测** | 代码已处理：需在手势内调用 `speak()`；AudioContext 可能在 resume 前 suspended（内置合成为此可能静音，但会报 `ok:true` 前已排程） |
| Firefox | **未实测** | 代码已处理：`voiceschanged` 支持较晚，已加轮询兜底 |

> 结论：**Windows Chromium 已完成程序化验证（含内置合成真实排程）；真实听感与 Android/iOS 需人工确认，本文不声称通过。**

### 人工验证步骤（2 分钟）

1. `npm run build && npm run preview`
2. Windows Chrome 打开 `http://127.0.0.1:4173/pronunciation`
3. 看四个指标：本机应显示"语音列表 已加载 3 / 美音 0 / 英音 0"
4. 点"播放（US）"→ 应听到**内置合成**的声音；结果行显示"来源 内置合成"
5. 点"慢速播放"→ 时长明显变长
6. 若想要自然语音：Windows 设置 → 时间和语言 → 语言 → 添加英语（美国）→ 重启 Chrome → 重新检测，count 应变为 >0，来源变为"系统语音"
7. 手机访问同一地址重复 4–5（iOS 需先点一次页面）

## 五、已知限制

- **内置合成只是"能出声"级别**：共振峰合成不等于真人发音，语调机械，适合兜底不适合练听力。
- **演示词库没有录音文件**：全部走系统语音或内置合成。要接真实录音，在导入 CSV 填 `audioUS` / `audioUK`。
- **录音无法精确调速**：`playbackRate` 只支持有限档位，慢速对录音是 0.75 倍。
- **headless 无法证明出声**：自动化只能证明调用链与音频图正确。
- **iOS Safari 的 AudioContext 可能需 resume()**：内置合成路径在无手势时应由用户点击触发，已在按钮内调用。
