import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom lacks these; components query them for theming/audio support.
// All shims are `configurable` so individual tests can replace them.
// Installed unconditionally: jsdom's stub (when present) returns undefined and
// would make `matchMedia(...).matches` throw inside theme resolution.
Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  writable: true,
  // Plain function, not `vi.fn()`: the vitest config resets mocks between
  // tests, which would strip a mock implementation and return undefined.
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

if (!('speechSynthesis' in window)) {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: {
      getVoices: () => [],
      speak: vi.fn(),
      cancel: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

if (!('SpeechSynthesisUtterance' in window)) {
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    },
  });
}

if (!('Audio' in window)) {
  // Only a placeholder; pronunciation tests install a functional fake.
  Object.defineProperty(window, 'Audio', {
    configurable: true,
    writable: true,
    value: class {
      play() {
        return Promise.reject(new Error('Audio not available in jsdom'));
      }
      pause() {}
    },
  });
}
