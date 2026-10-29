/** Clock + local-date helpers. All persisted event timestamps are UTC epoch ms. */

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/** `YYYY-MM-DD` in the user's local timezone — the only key used for daily stats. */
export function toDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDaysToKey(key: string, amount: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + amount);
  return toDateKey(d.getTime());
}

export function startOfLocalDay(timestamp: number): number {
  const d = new Date(timestamp);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(timestamp: number, days: number): number {
  const d = new Date(timestamp);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Human friendly "3 天后 / 12 分钟后" label used in the queue previews. */
export function formatDueLabel(nextReviewAt: number | null, now: number): string {
  if (nextReviewAt === null) return '未安排';
  const delta = nextReviewAt - now;
  if (delta <= 0) return '现在到期';
  if (delta < HOUR_MS) return `${Math.max(1, Math.round(delta / MINUTE_MS))} 分钟后`;
  if (delta < DAY_MS) return `${Math.round(delta / HOUR_MS)} 小时后`;
  return `${Math.round(delta / DAY_MS)} 天后`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小时 ${minutes % 60} 分`;
}

export function formatDateTime(timestamp: number | null): string {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
