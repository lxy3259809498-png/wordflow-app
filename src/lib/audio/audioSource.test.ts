import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  YoudaoAudioProvider,
  clearAudioResolutionCache,
  resolveAudio,
  type AudioSourceProvider,
} from '@/lib/audio/audioSource';

const word = (overrides: Partial<{ term: string; audioUS: string | null; audioUK: string | null }> = {}) => ({
  term: 'abandon',
  audioUS: null,
  audioUK: null,
  ...overrides,
});

afterEach(() => {
  clearAudioResolutionCache();
  vi.restoreAllMocks();
});

describe('resolveAudio', () => {
  it('prefers the stored UK file for a UK request', async () => {
    const result = await resolveAudio(
      word({ audioUS: 'https://x/us.mp3', audioUK: 'https://x/uk.mp3' }),
      'UK',
      { onlineEnabled: true },
    );
    expect(result).toEqual({
      url: 'https://x/uk.mp3',
      provider: '词条自带音频',
      kind: 'stored',
    });
  });

  it('prefers the stored US file for a US request', async () => {
    const result = await resolveAudio(
      word({ audioUS: 'https://x/us.mp3' }),
      'US',
      { onlineEnabled: true },
    );
    expect(result?.url).toBe('https://x/us.mp3');
  });

  it('returns null when online audio is disabled and nothing is stored', async () => {
    const result = await resolveAudio(word(), 'US', { onlineEnabled: false });
    expect(result).toBeNull();
  });

  it('falls through providers in order and caches the winner', async () => {
    const first: AudioSourceProvider = {
      id: 'first',
      label: 'First',
      resolve: vi.fn().mockResolvedValue(null),
    };
    const second: AudioSourceProvider = {
      id: 'second',
      label: 'Second provider',
      resolve: vi
        .fn()
        .mockResolvedValue({ url: 'https://x/a.mp3', provider: 'Second provider', kind: 'online' }),
    };

    const result = await resolveAudio(word(), 'US', {
      onlineEnabled: true,
      providers: [first, second],
    });
    expect(result?.provider).toBe('Second provider');
    expect(first.resolve).toHaveBeenCalledTimes(1);
    expect(second.resolve).toHaveBeenCalledTimes(1);

    // Second call is served from the cache — no extra network probe.
    await resolveAudio(word(), 'US', { onlineEnabled: true, providers: [first, second] });
    expect(second.resolve).toHaveBeenCalledTimes(1);
  });

  it('caches a negative result too, so failures are not retried constantly', async () => {
    const provider: AudioSourceProvider = {
      id: 'p',
      label: 'P',
      resolve: vi.fn().mockResolvedValue(null),
    };
    await resolveAudio(word(), 'US', { onlineEnabled: true, providers: [provider] });
    await resolveAudio(word(), 'US', { onlineEnabled: true, providers: [provider] });
    expect(provider.resolve).toHaveBeenCalledTimes(1);
  });

  it('caches per accent, not per word', async () => {
    const provider: AudioSourceProvider = {
      id: 'p',
      label: 'P',
      resolve: vi.fn().mockResolvedValue(null),
    };
    await resolveAudio(word(), 'US', { onlineEnabled: true, providers: [provider] });
    await resolveAudio(word(), 'UK', { onlineEnabled: true, providers: [provider] });
    expect(provider.resolve).toHaveBeenCalledTimes(2);
  });
});

describe('YoudaoAudioProvider', () => {
  it('builds a UK url with type=1 and a US url with type=2', async () => {
    const provider = new YoudaoAudioProvider();
    const uk = await provider.resolve('abandon', 'UK');
    const us = await provider.resolve('abandon', 'US');

    expect(uk?.url).toContain('type=1');
    expect(uk?.url).toContain('audio=abandon');
    expect(us?.url).toContain('type=2');
    expect(uk?.kind).toBe('online');
    expect(uk?.provider).toContain('英音');
    expect(us?.provider).toContain('美音');
  });

  it('does not probe with fetch (the host sends no CORS headers)', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = new YoudaoAudioProvider();
    await provider.resolve('abandon', 'US');
    // Probing here would falsely mark a playable URL as unavailable.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('url-encodes the term', async () => {
    const provider = new YoudaoAudioProvider();
    const result = await provider.resolve("don't", 'US');
    expect(result?.url).toContain(encodeURIComponent("don't"));
  });

  it('refuses terms that are not plain English words', async () => {
    const provider = new YoudaoAudioProvider();
    expect(await provider.resolve('', 'US')).toBeNull();
    expect(await provider.resolve('中文', 'US')).toBeNull();
    expect(await provider.resolve('a123', 'US')).toBeNull();
  });
});
