import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { unstable_cache } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  Users,
  Swords,
  ShieldCheck,
  Trophy,
  Image as ImageIcon,
  BarChart3,
  Activity,
  ShieldHalf,
  Calendar,
  Target,
  UserCheck,
  Sword,
  ExternalLink,
  PlayCircle,
} from 'lucide-react'
import MarketingNav from '@/components/MarketingNav'
import { getMarketingPaths } from '@/lib/marketing-paths-request'
import { buildTenantHostUrl, resolveTenantBySlugAnyStatus } from '@/lib/tenant-resolver'
import { loadGuildProfileSettings, ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import { toYoutubeEmbedUrl } from '@/lib/youtube-embed'
import { getAppSetting } from '@/lib/app-settings'
import { resolveAlbionDisplayName } from '@/lib/albion-display-name'
import { loadGalleryItems } from '@/lib/guild-profile-gallery'
import {
  loadRecentTrackedBattle,
  loadTopContributorsThisWeek,
} from '@/lib/guild-profile-activity'
import {
  loadLifetimeBattleStats,
  loadTopWeaponCategoriesLast30d,
  loadTopRivalsLast30d,
  loadAdminTeam,
  loadAllianceInfo,
  resolveProfileServer,
  type WeaponCategoryUsage,
  type RivalGuild,
} from '@/lib/guild-profile-stats'
import { loadMemberDashboardSummary } from '@/lib/guild-profile-member-dashboard'
import { loadSectionStats } from '@/lib/guild-profile-section-stats'
import { getAdminBadgeCounts } from '@/lib/admin-badges'
import { formatRelativeFine } from '@/lib/relative-time'
import { getSession } from '@/lib/session'
import MemberDashboardSection from '@/components/guild/MemberDashboardSection'
import SignedOutCta from '@/components/guild/SignedOutCta'
import HomeAdminPendingCard from '@/components/HomeAdminPendingCard'
import GuildPublicWeeklyStats from '@/components/GuildPublicWeeklyStats'
import { loadGuildWeeklyStats, type GuildWeeklyStats } from '@/lib/guild-weekly-stats'
import { getLocale } from 'next-intl/server'
import { isLocale } from '@/i18n/locales'
import { getLocalizedItemName } from '@/lib/item-names'
import { canonicalT8WeaponId, stripTierPrefix } from '@/lib/weapon-display'
import AdminTeamGridClient from '@/components/AdminTeamGridClient'
import {
  EditableField,
  GalleryEditControl,
  HiddenSectionsControl,
  SectionVisibilityControl,
  type HiddenSectionEntry,
} from '@/components/guild/GuildProfileEditControls'
import GuildProfileHero from '@/components/guild/GuildProfileHero'
import GuildProfileDisabledState from '@/components/guild/GuildProfileDisabledState'
import {
  SectionHeader,
  GalleryGrid,
  StatCard,
  RecentBattleCard,
  TopContributorsCard,
  InfoCard,
  WeaponDistributionCard,
  RivalsCard,
  formatRatio,
} from '@/components/guild/GuildProfileSections'
import {
  PUBLIC_GUILD_PROFILE_CACHE_REVALIDATE_SECONDS,
  publicGuildProfileCacheTag,
} from '@/lib/guild-profile-cache'

export const dynamic = 'force-dynamic'

interface Params {
  slug: string
}

interface PublicGuildProfileCachedData {
  stats: Awaited<ReturnType<typeof loadSectionStats>>
  galleryItems: Awaited<ReturnType<typeof loadGalleryItems>>
  recentBattle: Awaited<ReturnType<typeof loadRecentTrackedBattle>>
  topContributors: Awaited<ReturnType<typeof loadTopContributorsThisWeek>>
  weeklyStats: GuildWeeklyStats | null
  serverCode: Awaited<ReturnType<typeof resolveProfileServer>>
  lifetimeStats: Awaited<ReturnType<typeof loadLifetimeBattleStats>> | null
  weaponDistribution: WeaponCategoryUsage[]
  rivals: RivalGuild[]
  adminTeam: Awaited<ReturnType<typeof loadAdminTeam>>
  alliance: Awaited<ReturnType<typeof loadAllianceInfo>>
}

async function loadPublicGuildProfileData(
  guildId: string,
  showActivity: boolean,
  showStats: boolean,
  showMembers: boolean,
  showBattles: boolean,
  showRegearStats: boolean,
  showLeaderboard: boolean,
  showAdminTeam: boolean,
  showWeapons: boolean,
  showRivals: boolean,
  weeklyStatsEnabled: boolean,
  serverOverride: string,
): Promise<PublicGuildProfileCachedData> {
  const [
    stats,
    galleryItems,
    recentBattle,
    topContributors,
    weeklyStats,
    serverCode,
    lifetimeStats,
    weaponDistribution,
    rivals,
    adminTeam,
    alliance,
  ] = await Promise.all([
    loadSectionStats(guildId, {
      showMembers: showStats && showMembers,
      showBattles: showStats && showBattles,
      showRegearStats: showStats && showRegearStats,
    }),
    loadGalleryItems(guildId),
    showActivity && showBattles ? loadRecentTrackedBattle(guildId) : Promise.resolve(null),
    showActivity && showLeaderboard ? loadTopContributorsThisWeek(guildId, 3) : Promise.resolve([]),
    showActivity && weeklyStatsEnabled
      ? loadGuildWeeklyStats(guildId)
      : Promise.resolve<GuildWeeklyStats | null>(null),
    resolveProfileServer(guildId, serverOverride),
    showStats && showBattles ? loadLifetimeBattleStats(guildId) : Promise.resolve(null),
    showWeapons && showBattles ? loadTopWeaponCategoriesLast30d(guildId) : Promise.resolve<WeaponCategoryUsage[]>([]),
    showRivals && showBattles ? loadTopRivalsLast30d(guildId) : Promise.resolve<RivalGuild[]>([]),
    showAdminTeam ? loadAdminTeam(guildId) : Promise.resolve([]),
    loadAllianceInfo(guildId, serverOverride),
  ])

  return {
    stats,
    galleryItems,
    recentBattle,
    topContributors,
    weeklyStats,
    serverCode,
    lifetimeStats,
    weaponDistribution,
    rivals,
    adminTeam,
    alliance,
  }
}

async function loadCachedPublicGuildProfileData(
  guildId: string,
  showActivity: boolean,
  showStats: boolean,
  showMembers: boolean,
  showBattles: boolean,
  showRegearStats: boolean,
  showLeaderboard: boolean,
  showAdminTeam: boolean,
  showWeapons: boolean,
  showRivals: boolean,
  weeklyStatsEnabled: boolean,
  serverOverride: string,
): Promise<PublicGuildProfileCachedData> {
  return unstable_cache(
    () => loadPublicGuildProfileData(
      guildId,
      showActivity,
      showStats,
      showMembers,
      showBattles,
      showRegearStats,
      showLeaderboard,
      showAdminTeam,
      showWeapons,
      showRivals,
      weeklyStatsEnabled,
      serverOverride,
    ),
    [
      'public-guild-profile-data',
      guildId,
      String(showActivity),
      String(showStats),
      String(showMembers),
      String(showBattles),
      String(showRegearStats),
      String(showLeaderboard),
      String(showAdminTeam),
      String(showWeapons),
      String(showRivals),
      String(weeklyStatsEnabled),
      serverOverride,
    ],
    {
      tags: [publicGuildProfileCacheTag(guildId)],
      revalidate: PUBLIC_GUILD_PROFILE_CACHE_REVALIDATE_SECONDS,
    },
  )()
}

// force-dynamic 라우트지만 공개 공통 통계는 세션과 분리해 60초 캐시한다.
// 본인 멤버 대시보드/어드민 badge 처럼 세션 의존 데이터는 아래 page 함수에서
// 별도로 uncached 로 읽어 사용자 간 데이터가 섞이지 않게 한다.

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  // pending tenant 도 metadata 생성을 위해 lookup — 봇만 초대하고 위저드를
  // 끝내지 못한 길드는 status='pending' 으로 남고, active-only resolver 로는
  // null 이 떨어져 404 메타가 박힌다. 페이지 본문에서 pending/active+disabled
  // 모두 안내 화면을 보여주므로 메타도 같이 noindex 로 맞춘다.
  const tenant = await resolveTenantBySlugAnyStatus(slug)
  if (!tenant || (tenant.status !== 'active' && tenant.status !== 'pending')) {
    return { title: '404' }
  }
  const [displayName, settings, tMeta] = await Promise.all([
    resolveAlbionDisplayName(tenant.tenantId, tenant.slug, tenant.name),
    tenant.status === 'active'
      ? loadGuildProfileSettings(tenant.tenantId)
      : Promise.resolve(null),
    getTranslations('meta'),
  ])
  const ogTitle = tMeta('ogGuildTitle', { name: displayName })
  // 공개 프로필이 꺼졌거나 (active+disabled), 위저드 미완료 (pending) 길드는
  // 슬러그가 살아있어도 검색 인덱싱 대상이 아니다 — 어드민이 ON 한 후에만
  // SEO surface 로 노출.
  if (tenant.status === 'pending' || !settings || !settings.enabled) {
    return {
      title: ogTitle,
      robots: { index: false, follow: false },
    }
  }
  const ogDescription = tMeta('ogGuildDescription', { name: displayName })
  // Discord/Slack 임베드의 큰 이미지로 길드 배너를 그대로 노출. 미설정 길드는
  // openGraph.images 를 비워 root layout 의 default OG image 가 fallback 된다.
  const guildOgImages = settings.bannerUrl
    ? [{ url: settings.bannerUrl, alt: displayName }]
    : undefined
  const canonicalUrl = `https://albion-guildmanager.com/g/${tenant.slug}`
  return {
    title: ogTitle,
    description: ogDescription,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'profile',
      siteName: tMeta('ogSiteName'),
      title: ogTitle,
      description: ogDescription,
      url: canonicalUrl,
      ...(guildOgImages && { images: guildOgImages }),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription,
      ...(guildOgImages && { images: guildOgImages.map((i) => i.url) }),
    },
  }
}

export default async function GuildProfilePage({
  params,
}: {
  params: Promise<Params>
}) {
  const { slug } = await params
  // 봇만 초대하고 온보딩 위저드를 미완료 (status='pending') 한 길드도 슬러그는
  // 살아있다. active-only resolver 는 pending 을 null 로 떨궈 notFound() →
  // 404 로 직행했다 — 여기는 "아직 설정 중" 안내 페이지로 살리고 admin 이라면
  // /onboard 에서 위저드를 이어 진행할 수 있게 CTA 를 노출한다. 'archived' 등
  // 그 외 상태는 정말 사라진 길드라 그대로 404.
  const tenant = await resolveTenantBySlugAnyStatus(slug)
  if (!tenant) notFound()
  if (tenant.status !== 'active' && tenant.status !== 'pending') notFound()

  const [displayName, settings, session] = await Promise.all([
    resolveAlbionDisplayName(tenant.tenantId, tenant.slug, tenant.name),
    tenant.status === 'active'
      ? loadGuildProfileSettings(tenant.tenantId)
      : Promise.resolve(null),
    getSession(),
  ])

  if (tenant.status === 'pending') {
    return <GuildProfileDisabledState displayName={displayName} pending />
  }

  if (!settings) notFound()

  // 토글이 꺼져 있으면 404 대신 친화적인 "아직 활성화되지 않음" 안내 페이지를
  // 띄운다 — 슬러그를 안 길드원이 처음 들어와 404 만 보고 떠나는 패턴을 막고,
  // 어드민이라면 곧장 활성화 화면으로 이동할 수 있게 한다. 검색 인덱싱은
  // generateMetadata 에서 noindex 처리.
  if (!settings.enabled) {
    return <GuildProfileDisabledState displayName={displayName} />
  }

  // 멤버 대시보드 섹션은 길드별 토글(`member_dashboard_enabled`) 로 게이트한다.
  // 'true' 인 길드만 본인 카드 + 비로그인 CTA 배너를 노출한다.
  const [
    memberDashboardEnabledRaw,
    localAccountsEnabledRaw,
    localInviteHash,
    weeklyStatsEnabledRaw,
  ] = await Promise.all([
    getAppSetting('member_dashboard_enabled', 'false', tenant.tenantId),
    getAppSetting('local_guild_accounts_enabled', 'false', tenant.tenantId),
    getAppSetting('local_guild_invite_hash', '', tenant.tenantId),
    getAppSetting('home_weekly_stats_enabled', 'false', tenant.tenantId),
  ])
  const memberDashboardEnabled = memberDashboardEnabledRaw === 'true'
  const localLoginEnabled =
    localAccountsEnabledRaw === 'true' && localInviteHash.trim().length > 0

  // 이번 주 활동 KPI 위젯도 같은 길드별 토글(`home_weekly_stats_enabled`) — 원래
  // 홈(`/`) 페이지에 있던 위젯이 길드 공개 페이지로 이동했다 (#208). 설정 키는
  // 그대로 유지해 기존 길드의 'true' 가 즉시 반영되게 한다.
  const weeklyStatsEnabled = weeklyStatsEnabledRaw === 'true'

  // 세션이 보고 있는 길드 = 페이지 길드 + isMember 일 때만 멤버 카드 데이터를
  // 페치한다. 다른 길드의 멤버나 비로그인은 페치 자체를 건너뛰어 비용 0.
  // 어드민 처리 대기 카드 (HomeAdminPendingCard) 도 같은 토글 + isAdmin 게이트
  // — 길드 공개 페이지가 곧 길드의 홈 페이지 역할을 한다는 전제.
  const isThisGuildMember =
    memberDashboardEnabled &&
    session !== null &&
    session.guildId === tenant.tenantId &&
    session.isMember
  const isThisGuildAdmin =
    memberDashboardEnabled &&
    session !== null &&
    session.guildId === tenant.tenantId &&
    session.isAdmin

  // 본인 길드를 보고 있을 때(memberDashboardEnabled 무관) 는 layout 이 AppShell
  // 사이드바를 둘러주므로, 페이지 상단의 MarketingNav 는 중복이라 숨긴다. 다른
  // 길드 방문이거나 비로그인이면 기존 marketing 헤더 그대로 노출.
  const viewingOwnGuild =
    session !== null &&
    session.guildId === tenant.tenantId &&
    (session.isMember || session.isAdmin)
  const isOtherGuildSession =
    session !== null &&
    session.guildId !== tenant.tenantId
  const localLoginHref = localLoginEnabled
    ? buildTenantHostUrl(tenant.slug, `/guild-login?return=${encodeURIComponent('/')}`)
    : null
  // 본인 길드의 어드민일 때만 인라인 편집 활성화 — 별도 어드민 폼 대신 페이지
  // 자체에서 클릭 → 편집 → 저장 후 router.refresh() 로 즉시 반영. 일반 길드원
  // (isMember) 에게는 편집 UI 자체가 렌더되지 않아 추가 비용 0.
  const isOwnGuildAdmin =
    session !== null &&
    session.guildId === tenant.tenantId &&
    session.isAdmin === true

  const [
    publicData,
    memberSummary,
    adminBadges,
    t,
    tTime,
    tBattle,
    tNav,
    marketingPaths,
    localeRaw,
  ] = await Promise.all([
    loadCachedPublicGuildProfileData(
      tenant.tenantId,
      settings.showActivity,
      settings.showStats,
      settings.showMembers,
      settings.showBattles,
      settings.showRegearStats,
      settings.showLeaderboard,
      settings.showAdminTeam,
      settings.showWeapons,
      settings.showRivals,
      weeklyStatsEnabled,
      settings.serverOverride,
    ),
    isThisGuildMember && session
      ? loadMemberDashboardSummary(session.discordId, tenant.tenantId)
      : Promise.resolve(null),
    isThisGuildAdmin
      ? getAdminBadgeCounts(tenant.tenantId)
      : Promise.resolve(null),
    getTranslations('publicGuildProfile'),
    getTranslations('time'),
    getTranslations('battleTracking'),
    getTranslations('nav'),
    getMarketingPaths(),
    getLocale(),
  ])
  const {
    stats,
    galleryItems,
    recentBattle,
    topContributors,
    weeklyStats,
    serverCode,
    lifetimeStats,
    weaponDistribution,
    rivals,
    adminTeam,
    alliance,
  } = publicData

  // 본인 길드 페이지 → AGM 공식 사이트 진입 통로. tenant host 에서도 canonical
  // root 로 이동한다. 사이드바에도 같은 링크가 있지만 페이지 헤더에 한 번 더
  // 노출해 어퍼던스를 키운다.
  const accent = ACCENT_CLASS_MAP[settings.accentColor]
  // 라이프타임 카드는 데이터가 충분할 때만 노출 — 작은 표본이 도리어 길드를
  // 약해 보이게 만든다. 임계값은 의미 단위: 5전투 = 가벼운 스파링 이상.
  const showLifetimeStats =
    lifetimeStats !== null && lifetimeStats.evaluatedBattles >= 5
  // showStats 는 큰 통계 섹션(멤버/전투/리기어/리더보드/라이프타임 K/D) 전체 마스터
  // 토글. 어드민이 OFF 하면 하위 토글이 켜져있어도 섹션이 렌더되지 않는다.
  const hasStats =
    settings.showStats &&
    (settings.showMembers ||
      settings.showBattles ||
      settings.showRegearStats ||
      settings.showLeaderboard ||
      showLifetimeStats)
  // 위젯이 비활성이거나 (battleCount === 0) 인 길드는 weekly KPI 줄을 렌더하지
  // 않는다. activity 섹션 렌더 여부는 KPI 줄까지 함께 본다.
  const showWeeklyStats =
    weeklyStats !== null && weeklyStats.battleCount > 0
  // YouTube 임베드 URL — sanitizer 가 null 을 돌려주면 위젯 자체를 숨긴다.
  // 어드민이 잘못된 URL 을 저장 단계에서 차단당하므로, 여기에 도달한 값은 항상
  // 화이트리스트 통과한 값이지만, 데이터 변경/legacy 대비 한번 더 검증.
  const youtubeEmbedUrl = settings.youtubeUrl
    ? toYoutubeEmbedUrl(settings.youtubeUrl)
    : null
  // 활동 섹션 마스터 토글. 어드민이 명시적으로 끄면 데이터가 있어도 섹션 자체 숨김.
  // settings.showActivity 의 기본은 true 라 기존 길드 가시성에 변화 없음.
  const hasActivity =
    settings.showActivity &&
    (recentBattle !== null || topContributors.length > 0 || showWeeklyStats)
  // 모집 정보 카드 — 모집 상태가 closed 가 아니고 (recruiting roles 또는 join steps)
  // 둘 중 하나라도 채워졌을 때만. closed 면 모집 자체가 닫혀 있어 표시 X.
  // 어드민 본인일 때는 빈 카드라도 "+ 추가" 슬롯으로 노출해 직접 채우게 한다.
  const showRecruitmentInfo =
    settings.recruitmentStatus !== 'closed' &&
    (isOwnGuildAdmin ||
      settings.recruitingRoles.length > 0 ||
      settings.joinSteps.length > 0)
  // eventSchedule 섹션도 동일 — 어드민이면 빈 슬롯으로 노출.
  const showEventSchedule = isOwnGuildAdmin || settings.eventSchedule.length > 0
  // 운영진/무기/라이벌 토글 — 어드민이 명시적으로 OFF 하지 않은 한 데이터 있으면
  // 노출. settings.show* 는 기본 true 라 기존 길드는 변경 없음.
  const showAdminTeam = settings.showAdminTeam && adminTeam.length > 0
  const showWeapons = settings.showWeapons && weaponDistribution.length > 0
  const showRivals = settings.showRivals && rivals.length > 0
  // 무기 분포 비율 계산용 — UI 에서 progress bar 채우기.
  const weaponTotalCount = showWeapons
    ? weaponDistribution.reduce((sum, w) => sum + w.count, 0)
    : 0
  // serverCode 가 null 이면 (override/albion_server 둘 다 미설정) HeroChip 자체를
  // 숨긴다. 어드민이 본인 길드를 볼 때는 EditableField 의 emptyLabel 로
  // "+ 서버 설정" 어퍼던스가 노출되어 직접 채울 수 있다.
  const serverLabel = serverCode ? t(`server_${serverCode}`) : null
  const locale = isLocale(localeRaw) ? localeRaw : 'ko'

  // 어드민이 인라인 핀으로 끈 섹션 모음. 페이지 하단의 "다시 보이기" 위젯이
  // 이 목록을 받아 다시 켜는 단일 진입점을 제공. 어드민 외에는 빈 배열 처리.
  const hiddenSectionCandidates: Array<HiddenSectionEntry | null> = isOwnGuildAdmin
    ? [
        settings.showActivity ? null : { settingKey: 'guild_profile_show_activity', label: t('activityHeading') },
        settings.showStats ? null : { settingKey: 'guild_profile_show_stats', label: t('statsHeading') },
        settings.showAdminTeam ? null : { settingKey: 'guild_profile_show_admin_team', label: t('adminTeamHeading') },
        settings.showWeapons ? null : { settingKey: 'guild_profile_show_weapons', label: t('weaponDistributionLabel') },
        settings.showRivals ? null : { settingKey: 'guild_profile_show_rivals', label: t('rivalsLabel') },
        settings.showMembers ? null : { settingKey: 'guild_profile_show_members', label: t('statMembers') },
        settings.showBattles ? null : { settingKey: 'guild_profile_show_battles', label: t('statBattles') },
        settings.showRegearStats ? null : { settingKey: 'guild_profile_show_regear_stats', label: t('statRegear') },
        settings.showLeaderboard ? null : { settingKey: 'guild_profile_show_leaderboard', label: t('statLeaderboard') },
      ]
    : []
  const hiddenSections: HiddenSectionEntry[] = hiddenSectionCandidates.filter(
    (entry): entry is HiddenSectionEntry => entry !== null,
  )

  return (
    <div className="min-h-screen bg-[#08090d] text-white">
      {!viewingOwnGuild && (
        <MarketingNav
          guildLoginHref={`/login?returnTo=${encodeURIComponent(`/g/${tenant.slug}`)}`}
        />
      )}
      {/* 본인 길드원/어드민이 자기 길드 페이지를 볼 때만 노출되는 작은 진입 링크.
          MarketingNav 가 숨겨진 상태라 AGM 공식 사이트로 빠질 통로가 없어진다 —
          사이드바에도 같은 링크가 있지만 헤더에 한 번 더 두어 모바일 (사이드바
          드로어) 사용자도 한 번에 도달할 수 있게 한다. */}
      {viewingOwnGuild && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 flex justify-end">
          <Link
            href={marketingPaths.home}
            className="inline-flex items-center gap-1.5 text-xs text-white/55 hover:text-white/90 transition-colors"
          >
            <ExternalLink size={12} />
            <span>{tNav('officialSite')}</span>
          </Link>
        </div>
      )}

      <GuildProfileHero
        tenantSlug={tenant.slug}
        displayName={displayName}
        settings={settings}
        accent={accent}
        alliance={alliance}
        serverLabel={serverLabel}
        isOwnGuildAdmin={isOwnGuildAdmin}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        {/* 어드민 처리 대기 카드 — 길드 어드민이 본인 길드 페이지를 볼 때만 노출.
            홈(`/`) 의 동일 카드와 중복되지 않게 멘헤라는 홈쪽을 OFF (mig 122). */}
        {adminBadges && <HomeAdminPendingCard badges={adminBadges} />}

        {/* 길드원 본인 대시보드 — 활동 섹션 위에 노출. 비로그인 / 다른 길드 멤버
            에게는 작은 로그인 안내 배너만 (디자인 톤을 깨지 않게 1줄). */}
        {memberSummary && session && (
          <MemberDashboardSection
            summary={memberSummary}
            username={session.username}
            discordId={session.discordId}
            accent={accent}
          />
        )}
        {(memberDashboardEnabled || localLoginEnabled) && !viewingOwnGuild && (
          <SignedOutCta
            accent={accent}
            returnTo={`/g/${tenant.slug}`}
            localLoginHref={localLoginHref}
            isOtherGuildSession={isOtherGuildSession}
          />
        )}

        {/* 활동 — 이번 주 KPI 줄 + 최근 추적된 전투 + 이번 주 탑 킬러. 가입을
            고민 중인 사람에게 "지금 살아있는 길드" 라는 인상을 주는 핵심 섹션.
            KPI 줄은 home_weekly_stats_enabled 가 켜진 길드에서만 노출. 다른
            카드(전투/탑 킬러) 둘 중 하나만 있어도 자연스럽게 풀카드로 확장. */}
        {hasActivity && (
          <section className="relative group space-y-4">
            <SectionVisibilityControl
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_show_activity"
            />
            <SectionHeader
              icon={<Activity size={14} />}
              label={t('activityHeading')}
              accent={accent}
            />
            {showWeeklyStats && weeklyStats && (
              <GuildPublicWeeklyStats stats={weeklyStats} accent={accent} />
            )}
            {(recentBattle !== null || topContributors.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {recentBattle && (
                  <div
                    className={`${
                      topContributors.length > 0 ? 'lg:col-span-3' : 'lg:col-span-5'
                    } rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm transition-colors hover:bg-gray-900/60`}
                  >
                    <RecentBattleCard
                      battle={recentBattle}
                      accent={accent}
                      sizeLabel={tBattle(`size_${recentBattle.sizeCategory}`)}
                      outcomeLabel={t(`outcome_${recentBattle.outcome}`)}
                      relativeLabel={formatRelativeFine(recentBattle.startedAt, tTime)}
                      titleLabel={t('recentBattleLabel')}
                      opponentLabel={
                        recentBattle.primaryOpponentName
                          ? t('vsOpponent', { name: recentBattle.primaryOpponentName })
                          : t('battleNoOpponent')
                      }
                    />
                  </div>
                )}
                {topContributors.length > 0 && (
                  <div
                    className={`${
                      recentBattle ? 'lg:col-span-2' : 'lg:col-span-5'
                    } rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm transition-colors hover:bg-gray-900/60`}
                  >
                    <TopContributorsCard
                      contributors={topContributors}
                      accent={accent}
                      titleLabel={t('topContributorsLabel')}
                      killsUnit={t('killsUnit')}
                    />
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 갤러리 — 항목 수에 따라 1열 / 2열 / editorial(1+rest) 자동 전환.
            어드민 본인이면 비어 있어도 "편집" 핀을 노출해 첫 항목을 추가할 수 있게 한다. */}
        {(galleryItems.length > 0 || isOwnGuildAdmin) && (
          <section className="relative group space-y-4">
            <GalleryEditControl enabled={isOwnGuildAdmin} items={galleryItems} />
            <SectionHeader
              icon={<ImageIcon size={14} />}
              label={t('galleryHeading')}
              accent={accent}
            />
            {galleryItems.length > 0 ? (
              <GalleryGrid items={galleryItems} fallbackAlt={displayName} accent={accent} />
            ) : (
              <div className="rounded-xl border border-dashed border-gray-700 bg-gray-950/40 px-4 py-12 text-center">
                <ImageIcon size={28} className="mx-auto text-gray-600" />
                <p className="text-gray-500 text-xs mt-2">{t('galleryEmptyAdmin')}</p>
              </div>
            )}
          </section>
        )}

        {/* YouTube 영상 — 어드민이 설정한 단일 영상/플레이리스트. sanitizer 통과
            못한 값이면 위젯 자체를 숨긴다 (XSS 경계). 가로 16:9 + lazy load. */}
        {youtubeEmbedUrl && (
          <section className="space-y-4">
            <SectionHeader
              icon={<PlayCircle size={14} />}
              label={t('youtubeHeading')}
              accent={accent}
            />
            <div
              className={`relative rounded-xl border ${accent.border} bg-gray-900/40 overflow-hidden backdrop-blur-sm`}
            >
              <div className="aspect-video">
                <iframe
                  src={youtubeEmbedUrl}
                  title="YouTube"
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
                  className="w-full h-full border-0"
                />
              </div>
            </div>
          </section>
        )}

        {/* 통계 카드 — 큰 숫자 + 아이콘 칩 + 코너 글로우 */}
        {hasStats && (
          <section className="relative group space-y-4">
            <SectionVisibilityControl
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_show_stats"
            />
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
              {/* 라이프타임 K/D 카드 — kills/deaths 합산값을 작은 글씨로 함께 노출해
                  비율의 표본 크기를 가린 신뢰도 함정을 피한다. */}
              {showLifetimeStats && lifetimeStats && (
                <StatCard
                  icon={<Sword size={16} />}
                  label={t('statLifetimeKd')}
                  value={null}
                  unit={
                    lifetimeStats.kdRatio === null
                      ? t('statLifetimeNotEnoughData')
                      : `${formatRatio(lifetimeStats.kdRatio)} (${lifetimeStats.kills.toLocaleString()}K / ${lifetimeStats.deaths.toLocaleString()}D)`
                  }
                  accent={accent}
                />
              )}
              {/* 승률 카드 — wins/(wins+losses). tie 는 분모/분자 모두 제외 (의미 없는 동률). */}
              {showLifetimeStats && lifetimeStats && lifetimeStats.winRate !== null && (
                <StatCard
                  icon={<ShieldCheck size={16} />}
                  label={t('statWinRate')}
                  value={null}
                  unit={`${Math.round(lifetimeStats.winRate * 100)}% (${lifetimeStats.wins}W / ${lifetimeStats.losses}L)`}
                  accent={accent}
                />
              )}
            </div>
          </section>
        )}

        {/* 모집 정보 카드 — 모집 중일 때만, 그리고 admin 이 채운 정보가 있을 때만.
            recruitment status 배지가 hero 에 이미 노출되므로 여기는 디테일 (역할 +
            가입 절차) 만 담당. 어드민 본인이면 빈 카드도 "+ 추가" 슬롯으로 노출. */}
        {showRecruitmentInfo && (
          <section className="space-y-4">
            <SectionHeader
              icon={<UserCheck size={14} />}
              label={t('recruitmentInfoHeading')}
              accent={accent}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EditableField
                enabled={isOwnGuildAdmin}
                settingKey="guild_profile_recruiting_roles"
                currentValue={settings.recruitingRoles}
                kind="textarea"
                label={t('recruitingRolesLabel')}
                emptyLabel={t('recruitingRolesAddLabel')}
                placeholder={t('recruitingRolesPlaceholder')}
                maxLength={400}
              >
                {settings.recruitingRoles.length > 0 && (
                  <InfoCard
                    icon={<Target size={14} />}
                    title={t('recruitingRolesLabel')}
                    body={settings.recruitingRoles}
                    accent={accent}
                  />
                )}
              </EditableField>
              <EditableField
                enabled={isOwnGuildAdmin}
                settingKey="guild_profile_join_steps"
                currentValue={settings.joinSteps}
                kind="textarea"
                label={t('joinStepsLabel')}
                emptyLabel={t('joinStepsAddLabel')}
                placeholder={t('joinStepsPlaceholder')}
                maxLength={400}
              >
                {settings.joinSteps.length > 0 && (
                  <InfoCard
                    icon={<UserCheck size={14} />}
                    title={t('joinStepsLabel')}
                    body={settings.joinSteps}
                    accent={accent}
                  />
                )}
              </EditableField>
            </div>
          </section>
        )}

        {/* 정기 이벤트 일정 — 자유 텍스트 멀티라인. 채워졌을 때만. 어드민 본인이면
            빈 슬롯도 노출되어 직접 채울 수 있다. */}
        {showEventSchedule && (
          <section className="space-y-4">
            <SectionHeader
              icon={<Calendar size={14} />}
              label={t('eventScheduleHeading')}
              accent={accent}
            />
            <EditableField
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_event_schedule"
              currentValue={settings.eventSchedule}
              kind="textarea"
              label={t('eventScheduleHeading')}
              emptyLabel={t('eventScheduleAddLabel')}
              placeholder={t('eventSchedulePlaceholder')}
              maxLength={400}
            >
              {settings.eventSchedule.length > 0 && (
                <div
                  className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm`}
                >
                  <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">
                    {settings.eventSchedule}
                  </p>
                </div>
              )}
            </EditableField>
          </section>
        )}

        {/* 어드민 팀 — guild_avatars.is_admin = true 인 활성 길드원. 자동 추출. */}
        {showAdminTeam && (
          <section className="relative group space-y-4">
            <SectionVisibilityControl
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_show_admin_team"
            />
            <SectionHeader
              icon={<ShieldHalf size={14} />}
              label={t('adminTeamHeading')}
              accent={accent}
            />
            <AdminTeamGridClient
              members={adminTeam}
              accent={accent}
              isOwnGuildAdmin={isOwnGuildAdmin}
            />
          </section>
        )}

        {/* 무기 분포 (최근 30일) + 라이벌 길드 (최근 30일). 둘 다 활동 시그널이라
            한 섹션에 묶어 좌우 카드 레이아웃. 둘 중 하나만 있으면 풀카드. */}
        {(showWeapons || showRivals) && (
          <section className="space-y-4">
            <SectionHeader
              icon={<Swords size={14} />}
              label={t('combatProfileHeading')}
              accent={accent}
            />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {showWeapons && (
                <div className="relative group">
                  <SectionVisibilityControl
                    enabled={isOwnGuildAdmin}
                    settingKey="guild_profile_show_weapons"
                    size="sm"
                  />
                  <WeaponDistributionCard
                    weapons={weaponDistribution.map((w) => {
                      // 카테고리를 T8.0 base id 로 정규화해 albion-items 번들에서
                      // 로컬라이즈된 이름을 가져온다. 인챈트/티어 변종은 번들에 없는
                      // 경우가 있어 base 형으로 수렴 — 한국어면 "장로의 X" 가 되므로
                      // stripTierPrefix 로 접두사 제거.
                      const canonical = canonicalT8WeaponId(w.sampleItemId)
                      const localized = canonical
                        ? getLocalizedItemName(canonical, locale, w.category)
                        : w.category
                      return {
                        ...w,
                        label: stripTierPrefix(localized) || w.category,
                      }
                    })}
                    totalCount={weaponTotalCount}
                    accent={accent}
                    titleLabel={t('weaponDistributionLabel')}
                    windowLabel={t('rolling30dLabel')}
                  />
                </div>
              )}
              {showRivals && (
                <div className="relative group">
                  <SectionVisibilityControl
                    enabled={isOwnGuildAdmin}
                    settingKey="guild_profile_show_rivals"
                    size="sm"
                  />
                  <RivalsCard
                    rivals={rivals}
                    accent={accent}
                    titleLabel={t('rivalsLabel')}
                    windowLabel={t('rolling30dLabel')}
                    battlesUnit={t('battlesUnit')}
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* 섹션이 모두 꺼져있을 때 (갤러리도 비어있을 때) */}
        {!hasStats && galleryItems.length === 0 && !isOwnGuildAdmin && (
          <p className="text-gray-500 text-sm text-center py-12">{t('emptySections')}</p>
        )}

        <HiddenSectionsControl enabled={isOwnGuildAdmin} hiddenSections={hiddenSections} />

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
