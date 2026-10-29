import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Ghost, Info, Lock, Trophy, Users } from 'lucide-react';
import { PageHeader, ProgressBar, Spinner, InfoBanner, StatCard } from '@/components/ui';
import { useSnapshot } from '@/hooks/useSnapshot';
import { useApp } from '@/providers/appContext';
import { levelFor, summarise } from '@/lib/stats';

/**
 * Phase-1 leaderboard. It is intentionally a local-only demo: there are no real
 * users, no fake ranks and no invented scores. Only the current learner's own
 * local XP is shown, and the cloud section is explicitly disabled.
 */
export default function Leaderboard() {
  const snapshot = useSnapshot();
  const { settings } = useApp();

  const summary = useMemo(
    () => (snapshot ? summarise(snapshot.stats, snapshot.logs, Date.now(), settings.dailyGoalCount) : null),
    [snapshot, settings.dailyGoalCount],
  );

  if (!snapshot || !summary) return <Spinner label="正在计算本地进度…" />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="排行榜"
        subtitle="第一阶段只有本地演示状态。真实排行榜需要云端账号、服务端数据库与防作弊规则，尚未实现。"
      />

      <InfoBanner tone="warn" title="没有真实排名">
        这里不会显示虚构的其他用户、分数或名次。你看到的所有数据都是本浏览器 IndexedDB 中的真实学习记录。
      </InfoBanner>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="card card-pad">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-soft text-brand">
              <Users className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="section-title">本地（仅你）</h2>
              <p className="text-xs text-muted">无账号 · 无上传 · 无跨设备</p>
            </div>
          </div>

          <ol className="mt-5 space-y-2">
            <li className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-soft/40 p-3">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-semibold text-white">
                1
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">本机学习者</p>
                <p className="text-[11px] text-muted">
                  Lv.{summary.level.level} · {summary.xp} XP · 连续 {summary.streak} 天
                </p>
              </div>
              <span className="chip-brand">你自己</span>
            </li>
            {[2, 3, 4].map((rank) => (
              <li
                key={rank}
                className="flex items-center gap-3 rounded-xl border border-dashed border-line p-3 text-muted"
                aria-label={`第 ${rank} 名空位`}
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface text-sm font-semibold">{rank}</span>
                <div className="flex-1">
                  <p className="text-sm">等待云端用户系统</p>
                  <p className="text-[11px]">真实用户接入后才会填充</p>
                </div>
                <Lock className="h-3.5 w-3.5" aria-hidden />
              </li>
            ))}
          </ol>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatCard label="我的经验值" value={summary.xp} icon={<Trophy className="h-4 w-4" />} />
            <StatCard label="我的等级" value={`Lv.${summary.level.level}`} hint={`${summary.level.progress}% 升级进度`} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card card-pad">
            <h2 className="section-title">距离下一级</h2>
            <p className="mt-1 text-sm text-muted">
              再获得 {summary.level.xpForLevel - summary.level.xpIntoLevel} XP 升到 Lv.{summary.level.level + 1}
            </p>
            <div className="mt-3">
              <ProgressBar value={summary.level.xpIntoLevel} max={summary.level.xpForLevel} />
            </div>
            <p className="mt-3 text-xs text-muted">
              经验只由真实反馈产生：认识 4 XP（新词 +3）、模糊 2 XP、忘记 1 XP。同一张卡重复提交会被幂等键忽略。
            </p>
          </div>

          <div className="card card-pad">
            <div className="flex items-center gap-2">
              <Ghost className="h-4 w-4 text-muted" aria-hidden />
              <h2 className="section-title">云端排行榜（未启用）</h2>
            </div>
            <ul className="mt-3 space-y-2 text-sm text-muted">
              <li className="flex gap-2">
                <span aria-hidden>·</span> 需要真实认证与用户系统（邮箱 / OAuth）
              </li>
              <li className="flex gap-2">
                <span aria-hidden>·</span> 需要服务端数据库存储成绩与学习量
              </li>
              <li className="flex gap-2">
                <span aria-hidden>·</span> 需要防作弊：服务端重算、速率限制、异常检测
              </li>
              <li className="flex gap-2">
                <span aria-hidden>·</span> 需要隐私同意与数据最小化设计
              </li>
            </ul>
            <Link to="/settings" className="btn-secondary mt-4 w-full !text-xs">
              <Info className="h-3.5 w-3.5" aria-hidden />
              查看当前数据策略
            </Link>
          </div>
        </div>
      </section>

      <p className="text-center text-xs text-muted">
        当前等级进度来自 {summary.activeDays} 个活跃日的真实记录，不使用预设或伪造数据。
      </p>

      <div className="sr-only" aria-live="polite">
        本地排行：等级 {levelFor(summary.xp).level}，经验值 {summary.xp}
      </div>
    </div>
  );
}
