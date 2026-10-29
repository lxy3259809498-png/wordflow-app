import type { AiExamplePayload } from '@/lib/types';

/**
 * AI enrichment is optional. The client never holds an API key: requests go to
 * a server proxy (`VITE_AI_PROXY_URL`) which is expected to authenticate the
 * caller and hold the provider secret. Without configuration every caller gets
 * a clear "not configured" result and the rest of the app keeps working.
 */
export interface AiExampleRequest {
  wordId: string;
  term: string;
  definitions: string[];
}

export interface AiExampleResult {
  ok: boolean;
  data?: AiExamplePayload;
  /** `unconfigured` is a normal state, not an error. */
  code?: 'unconfigured' | 'timeout' | 'invalid' | 'http-error';
  message?: string;
}

export interface AiService {
  readonly id: string;
  isConfigured(): boolean;
  generate(request: AiExampleRequest, signal?: AbortSignal): Promise<AiExampleResult>;
}

const PROXY_URL = (import.meta.env.VITE_AI_PROXY_URL as string | undefined)?.trim() ?? '';

export const aiService: AiService = {
  id: PROXY_URL ? 'server-proxy' : 'unconfigured',
  isConfigured: () => PROXY_URL.length > 0,
  async generate(request, signal) {
    if (!PROXY_URL) {
      return {
        ok: false,
        code: 'unconfigured',
        message: '未配置 AI 服务。请在部署时设置后端代理地址（VITE_AI_PROXY_URL）。',
      };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const response = await fetch(`${PROXY_URL.replace(/\/$/, '')}/generate-example`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!response.ok) {
        return { ok: false, code: 'http-error', message: `服务返回 ${response.status}` };
      }
      const payload = (await response.json()) as Partial<AiExamplePayload>;
      const validation = validateAiPayload(payload, request.wordId);
      if (!validation.ok) return { ok: false, code: 'invalid', message: validation.message };
      return { ok: true, data: validation.data };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { ok: false, code: 'timeout', message: '请求超时，请稍后重试。' };
      }
      return { ok: false, code: 'http-error', message: (error as Error).message };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    }
  },
};

/** Reject misaligned AI output: wrong word, empty fields, or unescaped noise. */
export function validateAiPayload(
  payload: Partial<AiExamplePayload>,
  expectedWordId: string,
): { ok: true; data: AiExamplePayload } | { ok: false; message: string } {
  if (!payload || typeof payload !== 'object') return { ok: false, message: '返回内容不是对象' };
  if (payload.wordId !== expectedWordId) return { ok: false, message: '返回的单词 ID 不匹配' };
  const sentence = (payload.sentence ?? '').trim();
  const sentenceZh = (payload.sentenceZh ?? '').trim();
  const mnemonic = (payload.mnemonic ?? '').trim();
  if (sentence.length < 8 || sentence.length > 300) {
    return { ok: false, message: '英文例句长度异常' };
  }
  if (sentenceZh.length < 2 || sentenceZh.length > 300) {
    return { ok: false, message: '中文翻译长度异常' };
  }
  if (mnemonic.length > 400) return { ok: false, message: '记忆提示过长' };
  if (!/[a-zA-Z]/.test(sentence)) return { ok: false, message: '英文例句缺少英文内容' };
  return {
    ok: true,
    data: {
      wordId: expectedWordId,
      sentence,
      sentenceZh,
      mnemonic,
      generatedAt: Date.now(),
      provider: 'server-proxy',
    },
  };
}
