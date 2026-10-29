import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  GraduationCap,
  Home,
  Moon,
  NotebookPen,
  RotateCcw,
  Settings as SettingsIcon,
  Sun,
  Trophy,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/providers/appContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { LocalOnlyBadge } from '@/components/ui';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: '今日', icon: Home, end: true },
  { to: '/study', label: '背词', icon: GraduationCap },
  { to: '/review', label: '复习', icon: RotateCcw },
  { to: '/mistakes', label: '错词本', icon: NotebookPen },
  { to: '/decks', label: '词书', icon: BookOpen },
  { to: '/stats', label: '统计', icon: BarChart3 },
  { to: '/leaderboard', label: '排行榜', icon: Trophy },
  { to: '/settings', label: '设置', icon: SettingsIcon },
];

const MOBILE_NAV: NavItem[] = [
  { to: '/', label: '今日', icon: Home, end: true },
  { to: '/study', label: '背词', icon: GraduationCap },
  { to: '/review', label: '复习', icon: RotateCcw },
  { to: '/mistakes', label: '错词', icon: NotebookPen },
  { to: '/stats', label: '统计', icon: BarChart3 },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 8c2-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0" strokeLinecap="round" opacity=".6" />
          <path d="M3 12c2-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0" strokeLinecap="round" opacity=".85" />
          <path d="M3 16c2-1.6 3.6-1.6 5.4 0s3.6 1.6 5.4 0 3.6-1.6 5.4 0" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <span className="text-[17px] font-semibold tracking-tight">
          Word<span className="text-brand">Flow</span>
        </span>
      ) : null}
    </div>
  );
}

function ThemeToggle() {
  const { settings, updateSettings, isDark } = useApp();
  return (
    <button
      type="button"
      className="btn-ghost !px-2.5"
      onClick={() => updateSettings({ theme: isDark ? 'light' : 'dark' })}
      aria-label={isDark ? '切换到浅色模式' : '切换到深色模式'}
      title={settings.theme === 'system' ? '当前跟随系统，点击切换' : undefined}
    >
      {isDark ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const location = useLocation();
  const { settings } = useApp();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      {!online ? (
        <div className="flex items-center justify-center gap-2 bg-warn/15 px-3 py-1.5 text-xs font-medium text-warn">
          <WifiOff className="h-3.5 w-3.5" aria-hidden />
          离线模式：已保存的单词与学习记录仍可继续使用
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-[1400px] flex-1 items-stretch">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/70 px-3 py-5 lg:flex">
          <div className="px-2">
            <BrandMark />
          </div>
          <nav className="mt-7 flex flex-1 flex-col gap-1" aria-label="主导航">
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 space-y-2 rounded-xl border border-line bg-raised p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted">数据状态</span>
              <LocalOnlyBadge />
            </div>
            <p className="text-[11px] leading-relaxed text-muted">
              第一阶段使用浏览器 IndexedDB，无账号、无跨设备同步。可在设置中导出备份。
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted">
                每日目标 {settings.dailyGoalCount} 词
              </span>
              <ThemeToggle />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-line/70 bg-surface/85 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <BrandMark />
              <div className="flex items-center gap-1">
                <LocalOnlyBadge />
                <ThemeToggle />
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 pb-24 pt-5 sm:px-6 lg:px-8 lg:pb-10 lg:pt-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-raised/95 pb-safe backdrop-blur lg:hidden"
        aria-label="底部导航"
      >
        <div className="mx-auto flex max-w-md items-stretch justify-between px-1">
          {MOBILE_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[11px] font-medium transition ${
                  isActive ? 'text-brand' : 'text-muted hover:text-ink'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`grid h-7 w-9 place-items-center rounded-lg ${isActive ? 'bg-brand-soft' : ''}`}
                  >
                    <item.icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
