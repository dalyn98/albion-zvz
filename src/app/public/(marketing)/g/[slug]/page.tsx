import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { ExternalLink, Users, Swords, ShieldCheck, Trophy } from 'lucide-react'
import MarketingNav from '@/components/MarketingNav'
import { resolveTenantBySlug } from '@/lib/tenant-resolver'
import { loadGuildProfileSettings, ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import { getAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

interface Params {
  slug: string
}

// 같은 슬러그가 metadata 와 page 에서 두 번 호출되는 것을 피하지 않고, force-dynamic
// 이라 매 요청 새로 풀린다 — count 쿼리 묶음만큼 부하지만 비로그인 페이지라
// 캐시 비용보다 단순함이 이득.
export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const tenant = await resolveTenantBySlug(slug)
  if (!tenant) return { title: '404' }
  return {
    title: `${tenant.name} — Albion Guild Manager`,
    description: `${tenant.name} 길드의 공개 프로필. 멤버, 전투기록, 모집 상태를 확인할 수 있습니다.`,
  }
}

interface SectionStat {
  count: number
}

async function loadSectionStats(
  guildId: string,
  flags: { showMembers: boolean; showBattles: boolean; showRegearStats: boolean },
): Promise<{
  members: SectionStat | null
  battles: SectionStat | null
  regear: SectionStat | null
}> {
  const db = getAdminClient()

  const [members, battles, regear] = await Promise.all([
    flags.showMembers
      ? db
          .from('guild_avatars')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', guildId)
          .is('withdrawn_at', null)
      : Promise.resolve({ count: null }),
    flags.showBattles
      ? db
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', guildId)
          .not('battle_started_at', 'is', null)
      : Promise.resolve({ count: null }),
    flags.showRegearStats
      ? db
          .from('regear_requests')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', guildId)
          .eq('status', 'approved')
      : Promise.resolve({ count: null }),
  ])

  return {
    members: typeof members.count === 'number' ? { count: members.count } : null,
    battles: typeof battles.count === 'number' ? { count: battles.count } : null,
    regear: typeof regear.count === 'number' ? { count: regear.count } : null,
  }
}

export default async function GuildProfilePage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  const tenant = await resolveTenantBySlug(slug)
  if (!tenant) notFound()

  const settings = await loadGuildProfileSettings(tenant.tenantId)
  if (!settings.enabled) notFound()

  const stats = await loadSectionStats(tenant.tenantId, {
    showMembers: settings.showMembers,
    showBattles: settings.showBattles,
    showRegearStats: settings.showRegearStats,
  })

  const t = await getTranslations('publicGuildProfile')
  const accent = ACCENT_CLASS_MAP[settings.accentColor]
  const showCta =
    settings.recruitmentStatus !== 'closed' && settings.discordInviteUrl.length > 0

  return (
    <div className="min-h-screen bg-[#0b0d12] text-white">
      <MarketingNav />

      <header className="relative">
        <div className={`absolute inset-0 ${accent.heroGradient}`} />
        <div
          className={`absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full ${accent.heroGlow} blur-3xl pointer-events-none`}
        />
        {settings.bannerUrl && (
          <div className="absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.bannerUrl}
              alt=""
              className="w-full h-full object-cover opacity-50"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/40 to-[#0b0d12]" />
          </div>
        )}
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${accent.badgeBg} ${accent.badgeText} ${accent.badgeRing}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${accent.dot}`} />
                {t(`recruitment_${settings.recruitmentStatus}`)}
              </span>
              <span className="text-gray-400 text-xs">/g/{tenant.slug}</span>
            </div>
            <h1 className={`text-4xl sm:text-5xl font-black tracking-tight ${accent.heading}`}>
              {tenant.name}
            </h1>
            {settings.description && (
              <p className="text-gray-200 text-base sm:text-lg leading-relaxed max-w-2xl whitespace-pre-line">
                {settings.description}
              </p>
            )}
            {showCta && (
              <div className="pt-2">
                <a
                  href={settings.discordInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-2 ${accent.ctaBg} font-bold px-5 py-3 rounded-lg transition-colors text-sm`}
                >
                  {t('joinCta')}
                  <ExternalLink size={14} />
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        {/* 통계 카드 그리드 */}
        {(settings.showMembers ||
          settings.showBattles ||
          settings.showRegearStats ||
          settings.showLeaderboard) && (
          <section className="space-y-3">
            <h2 className="text-gray-400 text-sm font-bold uppercase tracking-widest">
              {t('statsHeading')}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {settings.showMembers && (
                <StatCard
                  icon={<Users size={16} />}
                  label={t('statMembers')}
                  value={stats.members?.count ?? 0}
                  unit={t('statMembersUnit')}
                  accent={accent}
                />
              )}
              {settings.showBattles && (
                <StatCard
                  icon={<Swords size={16} />}
                  label={t('statBattles')}
                  value={stats.battles?.count ?? 0}
                  unit={t('statBattlesUnit')}
                  accent={accent}
                />
              )}
              {settings.showRegearStats && (
                <StatCard
                  icon={<ShieldCheck size={16} />}
                  label={t('statRegear')}
                  value={stats.regear?.count ?? 0}
                  unit={t('statRegearUnit')}
                  accent={accent}
                />
              )}
              {settings.showLeaderboard && (
                <StatCard
                  icon={<Trophy size={16} />}
                  label={t('statLeaderboard')}
                  value={null}
                  unit={t('statLeaderboardCta')}
                  accent={accent}
                />
              )}
            </div>
          </section>
        )}

        {/* 어떤 섹션도 켜져있지 않을 때 */}
        {!settings.showMembers &&
          !settings.showBattles &&
          !settings.showRegearStats &&
          !settings.showLeaderboard && (
            <p className="text-gray-500 text-sm text-center py-12">{t('emptySections')}</p>
          )}

        <div className="border-t border-gray-800 pt-6 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-gray-500 text-xs">{t('poweredBy')}</p>
          <Link
            href="/"
            className="text-gray-400 hover:text-amber-300 text-xs font-semibold transition-colors"
          >
            albion-guildmanager.com
          </Link>
        </div>
      </main>
    </div>
  )
}

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | null
  unit: string
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
}

function StatCard({ icon, label, value, unit, accent }: StatCardProps) {
  return (
    <div
      className={`rounded-xl border ${accent.border} bg-gray-900/50 px-4 py-4 space-y-2`}
    >
      <div className={`flex items-center gap-1.5 text-xs font-semibold ${accent.heading}`}>
        {icon}
        {label}
      </div>
      {value !== null ? (
        <div>
          <span className="text-2xl font-black text-white">{value.toLocaleString()}</span>
          <span className="text-gray-500 text-xs ml-1">{unit}</span>
        </div>
      ) : (
        <div className="text-gray-300 text-sm">{unit}</div>
      )}
    </div>
  )
}
