import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  NO_DECK_SENTINEL,
  loadSettings,
  normaliseSettings,
  saveSettings,
} from '@/lib/settings/settings';

afterEach(() => {
  window.localStorage.clear();
});

describe('deck selection normalisation', () => {
  it('drops the internal "no deck" marker so it never reaches queries', () => {
    const settings = normaliseSettings({
      ...DEFAULT_SETTINGS,
      selectedDeckIds: [NO_DECK_SENTINEL],
    });
    expect(settings.selectedDeckIds).toEqual([]);
  });

  it('keeps real deck ids and drops empty/non-string entries', () => {
    const settings = normaliseSettings({
      ...DEFAULT_SETTINGS,
      selectedDeckIds: ['deck-a', '', NO_DECK_SENTINEL, 'deck-b', 42 as unknown as string],
    });
    expect(settings.selectedDeckIds).toEqual(['deck-a', 'deck-b']);
  });

  it('treats a missing selection as "all decks"', () => {
    const settings = normaliseSettings({ ...DEFAULT_SETTINGS, selectedDeckIds: undefined });
    expect(settings.selectedDeckIds).toEqual([]);
  });

  it('round-trips a single-deck selection through localStorage', () => {
    saveSettings({ ...DEFAULT_SETTINGS, selectedDeckIds: ['deck-a'] });
    expect(loadSettings().selectedDeckIds).toEqual(['deck-a']);
  });

  it('does not persist the marker even if it reaches storage', () => {
    window.localStorage.setItem(
      'wordflow.settings.v1',
      JSON.stringify({ ...DEFAULT_SETTINGS, selectedDeckIds: [NO_DECK_SENTINEL] }),
    );
    expect(loadSettings().selectedDeckIds).toEqual([]);
  });
});

describe('word order setting', () => {
  it('defaults to alphabetical', () => {
    expect(DEFAULT_SETTINGS.wordOrder).toBe('alphabetical');
  });

  it('accepts every supported order', () => {
    for (const order of ['alphabetical', 'random', 'frequency', 'mistakes'] as const) {
      expect(normaliseSettings({ ...DEFAULT_SETTINGS, wordOrder: order }).wordOrder).toBe(order);
    }
  });

  it('falls back to alphabetical for an unknown value', () => {
    const settings = normaliseSettings({
      ...DEFAULT_SETTINGS,
      wordOrder: 'sideways' as never,
    });
    expect(settings.wordOrder).toBe('alphabetical');
  });

  it('persists the chosen order', () => {
    saveSettings({ ...DEFAULT_SETTINGS, wordOrder: 'random' });
    expect(loadSettings().wordOrder).toBe('random');
  });
});