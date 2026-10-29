import type { Word } from '@/lib/types';
import type { Accent } from '@/lib/types';

/**
 * Where a word's audio can come from.
 *
 * Order of preference when speaking:
 *   1. `word.audioUS` / `word.audioUK` (bundled or imported, verified by the user)
 *   2. an online dictionary recording resolved by a provider
 *   3. system speech synthesis
 *   4. built-in formant synthesis (last resort, always audible)
 */
export interface ResolvedAudio {
  url: string;
  provider: string;
  /** Where the URL came from, for honest UI labelling. */
  kind: 'stored' | 'online';
}

export interface AudioSourceProvider {
  readonly id: string;
  readonly label: string;
  /** Returns null when the provider has no audio for this word/accent. */
  resolve(term: string, accent: Accent): Promise<ResolvedAudio | null>;
}

/**
 * Youdao dictionary TTS endpoint. It serves real MP3 recordings at low latency
 * and distinguishes UK (`type=1`) from US (`type=2`).
 *
 * IMPORTANT: this host does **not** send CORS headers, so `fetch()` fails with
 * "Failed to fetch" in the browser even though the audio is perfectly playable.
 * We therefore never probe with fetch — an `<audio>` element can play a
 * cross-origin source without CORS. Availability is discovered by the player
 * itself, which reports `loadstart` (works) or `error` (fall through).
 *
 * Caveat: it is a third-party service and can rate-limit or change. A failure
 * simply falls through to the next mechanism, never an error shown to the user.
 */
export class YoudaoAudioProvider implements AudioSourceProvider {
  readonly id = 'youdao';
  readonly label = '有道词典';

  async resolve(term: string, accent: Accent): Promise<ResolvedAudio | null> {
    const word = term.trim();
    if (!word || !/^[a-zA-Z][a-zA-Z' -]*$/.test(word)) return null;
    const type = accent === 'UK' ? 1 : 2;
    return {
      url: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=${type}`,
      provider: `${this.label}${accent === 'UK' ? '英音' : '美音'}`,
      kind: 'online',
    };
  }
}

export interface AudioResolverOptions {
  onlineEnabled: boolean;
  providers?: AudioSourceProvider[];
}

const defaultProviders = (): AudioSourceProvider[] => [new YoudaoAudioProvider()];

/** In-memory cache so one word is never probed twice per session. */
const memoryCache = new Map<string, ResolvedAudio | null>();

export async function resolveAudio(
  word: Pick<Word, 'term' | 'audioUS' | 'audioUK'>,
  accent: Accent,
  options: AudioResolverOptions,
): Promise<ResolvedAudio | null> {
  const stored = accent === 'UK' ? word.audioUK : word.audioUS;
  if (stored) {
    return { url: stored, provider: '词条自带音频', kind: 'stored' };
  }
  if (!options.onlineEnabled) return null;

  const cacheKey = `${accent}:${word.term.toLowerCase()}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey) ?? null;

  for (const provider of options.providers ?? defaultProviders()) {
    // Sequential on purpose: try the preferred provider before the next one.
    const resolved = await provider.resolve(word.term, accent);
    if (resolved) {
      memoryCache.set(cacheKey, resolved);
      return resolved;
    }
  }
  memoryCache.set(cacheKey, null);
  return null;
}

/** Test helper to clear the memoised lookups. */
export function clearAudioResolutionCache(): void {
  memoryCache.clear();
}
