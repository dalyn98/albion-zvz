import { getTranslations } from 'next-intl/server'
import {
  BarChart3,
  CheckCircle2,
  Clock,
  XOctagon,
  Coins,
  Sparkles,
} from 'lucide-react'
import { loadCraftStatsAdmin } from '@/app/actions/craft'
import { formatSilver } from '@/lib/silver'
import { formatRelativeFine } from '@/lib/relative-time'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import MemberAvatar from './MemberAvatar'

// 제작 리기어 운영 통계 패널. lifetime + 이번 주 (PT 월요일~) KPI 4종 + 제작자별
// 누적 표. 어드민이 "이번 주 누가 얼마나 만들었나" / "지금 적체된 작업 / 만료
// 되어 손실 발생한 작업" 을 한 화면에서 비교할 수 있게 한다. RSC — 데이터 로드 +
// 정렬은 server action 에서 끝나서 클라이언트 JS 부담은 없음.

export default async function AdminCraftStatsPanel() {
  const [{ stats, error }, t, tTime] = await Promise.all([
    loadCraftStatsAdmin(),
    getTranslations('adminCraft'),
    getTranslations('time'),
  ])

  if (error || !stats) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <BarChart3 size={16} className="text-amber-400" />
          {t('statsTitle')}
        </h2>
        <p className="text-xs text-rose-300">{error ?? t('statsError')}</p>
      </section>
    )
  }

  // 제작자 아바타. byCrafter 가 비어있으면 join 자체를 스킵.
  const avatarMap = await loadCrafterAvatars(stats.byCrafter.map((c) => c.discordId))

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <BarChart3 size={16} className="text-amber-400" />
          {t('statsTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">{t('statsHint')}</p>
      </div>

      {/* 이번 주 카드 4종. */}
      <div className="space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('statsWeeklyTitle')}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <KpiCard
            icon={<CheckCircle2 size={14} className="text-emerald-300" />}
            label={t('statsCollected')}
            value={stats.weekly.collectedCount.toLocaleString('en-US')}
          />
          <KpiCard
            icon={<Clock size={14} className="text-sky-300" />}
            label={t('statsInProgress')}
            value={stats.weekly.inProgressCount.toLocaleString('en-US')}
          />
          <KpiCard
            icon={<XOctagon size={14} className="text-rose-300" />}
            label={t('statsExpired')}
            value={stats.weekly.expiredCount.toLocaleString('en-US')}
          />
          <KpiCard
            icon={<Coins size={14} className="text-amber-300" />}
            label={t('statsReimbursementSilver')}
            value={formatSilver(stats.weekly.reimbursementSilver)}
          />
        </div>
      </div>

      {/* lifetime 카드 4종. */}
      <div className="space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('statsLifetimeTitle')}
        </p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <KpiCard
            icon={<CheckCircle2 size={14} className="text-emerald-300" />}
            label={t('statsCollected')}
            value={stats.lifetime.collectedCount.toLocaleString('en-US')}
          />
          <KpiCard
            icon={<Clock size={14} className="text-sky-300" />}
            label={t('statsInProgress')}
            value={stats.lifetime.inProgressCount.toLocaleString('en-US')}
          />
          <KpiCard
            icon={<XOctagon size={14} className="text-rose-300" />}
            label={t('statsExpired')}
            value={stats.lifetime.expiredCount.toLocaleString('en-US')}
          />
          <KpiCard
            icon={<Coins size={14} className="text-amber-300" />}
            label={t('statsReimbursementSilver')}
            value={formatSilver(stats.lifetime.reimbursementSilver)}
          />
        </div>
      </div>

      {/* 제작자별 표. lifetime collected 기준 — 한 번도 회수 안 된 제작자는 없음. */}
      <div className="space-y-2">
        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
          {t('statsByCrafterTitle')}
        </p>
        {stats.byCrafter.length === 0 ? (
          <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-4 text-center">
            {t('statsByCrafterEmpty')}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-950">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-900/70 text-gray-400 uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">
                    {t('statsCrafterCol')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('statsCollectedCol')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('statsModeMixCol')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('statsReimbursementSilverCol')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('statsFocusRateCol')}
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    {t('statsLastTaskCol')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {stats.byCrafter.map((c) => {
                  const avatarHash = avatarMap.get(c.discordId) ?? null
                  const focusRate =
                    c.collectedCount === 0
                      ? 0
                      : Math.round((c.focusUsedCount / c.collectedCount) * 100)
                  return (
                    <tr key={c.discordId} className="text-gray-200">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <MemberAvatar
                            discordId={c.discordId}
                            avatar={avatarHash}
                            size={24}
                          />
                          <span className="truncate">{c.username}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {c.collectedCount.toLocaleString('en-US')}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">
                        {t('statsModeMixValue', {
                          volunteer: c.volunteerCount,
                          paid: c.paidCount,
                        })}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-200">
                        {formatSilver(c.reimbursementSilver)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-300 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Sparkles size={11} className="text-amber-300" />
                          {focusRate}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">
                        {formatRelativeFine(c.lastTaskAt, tTime)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
}

function KpiCard({ icon, label, value }: KpiCardProps) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 space-y-1">
      <div className="text-[11px] text-gray-400 flex items-center gap-1">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="text-sm font-bold text-white tabular-nums">{value}</div>
    </div>
  )
}

// 제작자별 표 행 옆 아바타용. guild_avatars.avatar 는 Discord 의 hash 라
// MemberAvatar 가 Discord CDN URL 을 직접 합성한다 (broken hash 면 fallback).
async function loadCrafterAvatars(
  discordIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (discordIds.length === 0) return new Map()
  const session = await getSession()
  if (!session) return new Map()
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data } = await db
    .from('guild_avatars')
    .select('discord_id, avatar')
    .eq('guild_id', guildId)
    .in('discord_id', [...discordIds])
  const map = new Map<string, string | null>()
  for (const row of (data ?? []) as { discord_id: string; avatar: string | null }[]) {
    map.set(row.discord_id, row.avatar)
  }
  return map
}
