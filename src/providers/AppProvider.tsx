import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_SETTINGS,
  applyAccent,
  applyTheme,
  loadSettings,
  resolveDark,
  saveSettings,
} from '@/lib/settings/settings';
import { AppContext } from '@/providers/appContext';
import type { Toast } from '@/providers/appContext';
import type { AppSettings } from '@/lib/types';

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const isDark = useMemo(() => resolveDark(settings.theme), [settings.theme]);

  useEffect(() => {
    applyTheme(settings.theme);
    applyAccent(settings.accentColor);
  }, [settings.theme, settings.accentColor]);

  useEffect(() => {
    if (settings.theme !== 'system' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('system');
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, [settings.theme]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    const next = { ...DEFAULT_SETTINGS };
    saveSettings(next);
    setSettings(next);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      toastId.current += 1;
      const id = toastId.current;
      setToasts((current) => [...current.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismissToast(id), toast.kind === 'error' ? 6500 : 4000);
    },
    [dismissToast],
  );

  const value = useMemo(
    () => ({ settings, updateSettings, resetSettings, isDark, toasts, pushToast, dismissToast }),
    [settings, updateSettings, resetSettings, isDark, toasts, pushToast, dismissToast],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
