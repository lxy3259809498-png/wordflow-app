import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { useApp } from '@/providers/appContext';

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Spinner({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card card-pad flex flex-col items-center gap-3 py-12 text-center">
      {icon ? <div className="rounded-2xl bg-brand-soft p-3 text-brand">{icon}</div> : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-md text-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  title = '加载失败',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="card card-pad flex flex-col items-center gap-3 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-bad" aria-hidden />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="max-w-md text-sm text-muted">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  label,
  tone = 'brand',
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: 'brand' | 'ok' | 'warn';
}) {
  const percent = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const toneClass = tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : 'bg-brand';
  return (
    <div>
      {label ? (
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>{label}</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
      ) : null}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-line/70"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? '进度'}
      >
        <div className={`h-full rounded-full ${toneClass} transition-[width] duration-300`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {icon ? <span className="text-brand" aria-hidden>{icon}</span> : null}
      </div>
      <div className="stat-value mt-2">{value}</div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function InfoBanner({
  children,
  tone = 'info',
  title,
  className = '',
}: {
  children: ReactNode;
  tone?: 'info' | 'ok' | 'warn';
  title?: string;
  className?: string;
}) {
  const toneStyles =
    tone === 'ok'
      ? 'border-ok/30 bg-ok/10 text-ok'
      : tone === 'warn'
        ? 'border-warn/30 bg-warn/10 text-warn'
        : 'border-brand/25 bg-brand-soft text-brand';
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'warn' ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${toneStyles} ${className}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="text-ink/90">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        <div className={title ? 'mt-0.5 text-sm text-muted' : 'text-sm text-muted'}>{children}</div>
      </div>
    </div>
  );
}

export { InfoBanner as Alert };

export function Toasts() {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end"
      role="region"
      aria-label="通知"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-raised px-4 py-3 shadow-lift ${
            toast.kind === 'error'
              ? 'border-bad/40'
              : toast.kind === 'success'
                ? 'border-ok/40'
                : 'border-line'
          }`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.description ? <p className="mt-0.5 text-xs text-muted">{toast.description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            className="rounded p-1 text-muted hover:bg-surface hover:text-ink"
            aria-label="关闭通知"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}

export function LocalOnlyBadge() {  return (
    <Link
      to="/settings#data"
      className="chip border-line bg-surface text-muted hover:text-ink"
      title="第一阶段数据只保存在本浏览器 IndexedDB 中，没有跨设备同步"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
      仅本地保存
    </Link>
  );
}
