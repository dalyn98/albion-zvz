import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import {
  ExternalLink,
  Users,
  Swords,
  ShieldCheck,
  Trophy,
  Image as ImageIcon,
  BarChart3,
} from 'lucide-react'
import MarketingNav from '@/components/MarketingNav'
import { resolveTenantBySlug } from '@/lib/tenant-resolver'
import { loadGuildProfileSettings, ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import { loadGalleryItems, type GalleryItem } from '@/lib/guild-profile-gallery'
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

  const [stats, galleryItems] = await Promise.all([
    loadSectionStats(tenant.tenantId, {
      showMembers: settings.showMembers,
      showBattles: settings.showBattles,
      showRegearStats: settings.showRegearStats,
    }),
    loadGalleryItems(tenant.tenantId),
  ])

  const t = await getTranslations('publicGuildProfile')
  const accent = ACCENT_CLASS_MAP[settings.accentColor]
  const showCta =
    settings.recruitmentStatus !== 'closed' && settings.discordInviteUrl.length > 0
  const hasStats =
    settings.showMembers ||
    settings.showBattles ||
    settings.showRegearStats ||
    settings.showLeaderboard

  return (
    <div className="min-h-screen bg-[#08090d] text-white">
      <MarketingNav />

      {/* HERO — 좌측 수직 액센트 바 + 배너 + 글로우. 모집 open 일 때 도트가 ping. */}
      <header className="relative overflow-hidden">
        <div className={`absolute inset-0 ${accent.heroGradient}`} />
        <div
          className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full ${accent.heroGlow} blur-3xl pointer-events-none`}
        />
        {settings.bannerUrl && (
          <div className="absolute inset-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={settings.bannerUrl}
              alt=""
              className="w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-[#08090d]" />
          </div>
        )}
        <div className={`absolute top-0 left-0 bottom-0 w-[3px] ${accent.bar}`} />
        <div className={`absolute bottom-0 left-0 right-0 h-px ${accent.divider}`} />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-32">
          <div className="space-y-6">
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ring-1 backdrop-blur-sm ${accent.badgeBg} ${accent.badgeText} ${accent.badgeRing}`}
              >
                <span className="relative flex w-2 h-2">
                  {settings.recruitmentStatus === 'open' && (
                    <span
                      className={`absolute inline-flex w-full h-full rounded-full ${accent.dot} opacity-75 animate-ping`}
                    />
                  )}
                  <span className={`relative inline-flex w-2 h-2 rounded-full ${accent.dot}`} />
                </span>
                {t(`recruitment_${settings.recruitmentStatus}`)}
              </span>
              <span className="text-gray-500 text-xs font-mono tracking-wider">
                /g/{tenant.slug}
              </span>
            </div>
            <h1
              className={`text-5xl sm:text-7xl font-black tracking-tighter ${accent.heading} drop-shadow-2xl`}
            >
              {tenant.name}
            </h1>
            {settings.description && (
              <p className="text-gray-200 text-base sm:text-lg leading-relaxed max-w-2xl whitespace-pre-line">
                {settings.description}
              </p>
            )}
            {showCta && (
              <div className="pt-3">
                <a
                  href={settings.discordInviteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group inline-flex items-center gap-2 ${accent.ctaBg} font-bold px-6 py-3.5 rounded-lg transition-all text-sm shadow-lg hover:shadow-2xl hover:-translate-y-0.5`}
                >
                  {t('joinCta')}
                  <ExternalLink
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </a>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        {/* 갤러리 — 항목 수에 따라 1열 / 2열 / editorial(1+rest) 자동 전환 */}
        {galleryItems.length > 0 && (
          <section className="space-y-4">
            <SectionHeader
              icon={<ImageIcon size={14} />}
              label={t('galleryHeading')}
              accent={accent}
            />
            <GalleryGrid items={galleryItems} fallbackAlt={tenant.name} accent={accent} />
          </section>
        )}

        {/* 통계 카드 — 큰 숫자 + 아이콘 칩 + 코너 글로우 */}
        {hasStats && (
          <section className="space-y-4">
            <SectionHeader
              icon={<BarChart3 size={14} />}
              label={t('statsHeading')}
              accent={accent}
            />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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

        {/* 섹션이 모두 꺼져있을 때 (갤러리도 비어있을 때) */}
        {!hasStats && galleryItems.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-12">{t('emptySections')}</p>
        )}

        <div className="border-t border-gray-900 pt-6 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-gray-600 text-xs flex items-center gap-2">
            <span className={`inline-block w-1 h-1 rounded-full ${accent.dot}`} />
            {t('poweredBy')}
          </p>
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-200 text-xs font-semibold transition-colors"
          >
            albion-guildmanager.com
          </Link>
        </div>
      </main>
    </div>
  )
}

interface SectionHeaderProps {
  icon: React.ReactNode
  label: string
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
}

function SectionHeader({ icon, label, accent }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center gap-2 ${accent.heading} text-xs font-bold uppercase tracking-[0.25em]`}
      >
        {icon}
        <span>{label}</span>
      </div>
      <div className={`flex-1 h-px ${accent.divider}`} />
    </div>
  )
}

interface GalleryGridProps {
  items: GalleryItem[]
  fallbackAlt: string
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
}

// 항목 수 기반 분기. 1장 = 풀 카드, 2장 = 동일 그리드, 3장+ = editorial (첫
// 사진을 2x2 로 키우고 나머지는 1x1). 4장 이상부터는 sm:auto-rows 가 자연스럽게
// 확장한다.
function GalleryGrid({ items, fallbackAlt, accent }: GalleryGridProps) {
  if (items.length === 1) {
    return (
      <div className="grid grid-cols-1">
        <GalleryFigure item={items[0]} fallbackAlt={fallbackAlt} accent={accent} />
      </div>
    )
  }
  if (items.length === 2) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <GalleryFigure
            key={item.id}
            item={item}
            fallbackAlt={fallbackAlt}
            accent={accent}
          />
        ))}
      </div>
    )
  }
  const [first, ...rest] = items
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 sm:auto-rows-[160px] gap-3">
      <div className="sm:col-span-2 sm:row-span-2 sm:h-auto h-64">
        <GalleryFigure
          item={first}
          fallbackAlt={fallbackAlt}
          accent={accent}
          fillParent
        />
      </div>
      {rest.map((item) => (
        <div key={item.id} className="sm:h-auto h-44">
          <GalleryFigure item={item} fallbackAlt={fallbackAlt} accent={accent} fillParent />
        </div>
      ))}
    </div>
  )
}

interface GalleryFigureProps {
  item: GalleryItem
  fallbackAlt: string
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
  // editorial 그리드에서 부모 박스 크기에 맞춰야 할 때.
  fillParent?: boolean
}

function GalleryFigure({ item, fallbackAlt, accent, fillParent }: GalleryFigureProps) {
  const sizing = fillParent ? 'h-full' : 'aspect-[16/9]'
  return (
    <figure
      className={`group relative rounded-xl overflow-hidden border ${accent.border} bg-gray-900/50 ${sizing} transition-all hover:-translate-y-0.5 hover:shadow-2xl`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.imageUrl}
        alt={item.caption || fallbackAlt}
        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      {item.caption && (
        <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-4 py-3 text-sm text-white font-medium">
          {item.caption}
        </figcaption>
      )}
    </figure>
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
      className={`relative rounded-xl border ${accent.border} bg-gray-900/40 px-5 py-5 backdrop-blur-sm overflow-hidden transition-colors hover:bg-gray-900/60`}
    >
      {/* 코너 글로우 — 카드에 약한 입체감을 주기 위한 단일 블러 원. */}
      <div
        className={`absolute -top-12 -right-12 w-32 h-32 rounded-full ${accent.heroGlow} blur-2xl pointer-events-none`}
      />
      <div className="relative flex items-center justify-between mb-3">
        <span
          className={`flex items-center justify-center w-9 h-9 rounded-lg ${accent.badgeBg} ${accent.heading}`}
        >
          {icon}
        </span>
        <span
          className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}
        >
          {label}
        </span>
      </div>
      <div className="relative">
        {value !== null ? (
          <div className="flex items-baseline gap-1.5">
            <span className={`text-3xl font-black ${accent.heading}`}>
              {value.toLocaleString()}
            </span>
            <span className="text-gray-500 text-xs">{unit}</span>
          </div>
        ) : (
          <div className="text-gray-300 text-sm">{unit}</div>
        )}
      </div>
    </div>
  )
}
