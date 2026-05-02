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
  Activity,
  Crown,
  Skull,
  ShieldAlert,
  Globe,
  Clock,
  Languages,
  UserCheck,
  ShieldHalf,
  Calendar,
  Target,
  Sword,
} from 'lucide-react'
import MarketingNav from '@/components/MarketingNav'
import { resolveTenantBySlug } from '@/lib/tenant-resolver'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { loadGuildProfileSettings, ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import { getAppSetting } from '@/lib/app-settings'
import { loadGalleryItems, type GalleryItem } from '@/lib/guild-profile-gallery'
import {
  loadRecentTrackedBattle,
  loadTopContributorsThisWeek,
  loadTrackedBattleLifetimeCount,
  type RecentBattleSummary,
  type TopContributorSummary,
  type BattleOutcome,
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
import { getAdminBadgeCounts } from '@/lib/admin-badges'
import { formatRelativeFine } from '@/lib/relative-time'
import { getAdminClient } from '@/lib/supabase-admin'
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
import InlineEditableField, { type EditorOption } from '@/components/guild/InlineEditableField'
import AdminTeamGridClient from '@/components/AdminTeamGridClient'
import BannerInlineEdit from '@/components/guild/BannerInlineEdit'
import SectionVisibilityPin from '@/components/guild/SectionVisibilityPin'
import GalleryInlineEdit from '@/components/guild/GalleryInlineEdit'
import HiddenSectionsAdminBar, {
  type HiddenSectionEntry,
} from '@/components/guild/HiddenSectionsAdminBar'

export const dynamic = 'force-dynamic'

interface Params {
  slug: string
}

// 같은 슬러그가 metadata 와 page 에서 두 번 호출되는 것을 피하지 않고, force-dynamic
// 이라 매 요청 새로 풀린다 — count 쿼리 묶음만큼 부하지만 비로그인 페이지라
// 캐시 비용보다 단순함이 이득.
// 알비온 길드명은 항상 영어 (인게임 제약). tenants.name 은 Discord 길드명이라
// 한국어("멘헤라") 일 수 있어 공개 프로필에는 부적합 — 어드민이 위저드에서
// 입력한 albion_home_guild_name 을 우선, 미설정 시 slug 파생, 마지막 폴백으로
// Discord 명을 사용한다.
async function resolveAlbionDisplayName(
  tenantId: string,
  slug: string,
  fallback: string,
): Promise<string> {
  const albionName = (await getAppSetting('albion_home_guild_name', '', tenantId)).trim()
  if (albionName) return albionName
  const derived = displayNameFromSlug(slug)
  if (derived) return derived
  return fallback
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const tenant = await resolveTenantBySlug(slug)
  if (!tenant) return { title: '404' }
  const displayName = await resolveAlbionDisplayName(tenant.tenantId, tenant.slug, tenant.name)
  return {
    title: `${displayName} — Albion Guild Manager`,
    description: `${displayName} 길드의 공개 프로필. 멤버, 전투기록, 모집 상태를 확인할 수 있습니다.`,
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

  // 멀티테넌트 마이그레이션 (072) 에서 이 테이블들의 컬럼이 guild_id 로 통일됐다.
  // 이전 코드에서 tenant_id 로 잘못 필터해 silent 0 으로 떨어지던 버그 수정.
  // guild_avatars 는 PK 가 (guild_id, discord_id) 복합으로 바뀌어 (084) 단일
  // 'id' 컬럼이 없다 — head:true 카운트는 select 컬럼이 존재해야 하므로 '*' 사용.
  // battles 카운트는 events.battle_started_at 이 아니라 tenant_battle_records 기반
  // (low-engagement 컷 + bundle_split 토글 적용) 으로 /battles 페이지와 일치시킴.
  const [members, battlesCount, regear] = await Promise.all([
    flags.showMembers
      ? db
          .from('guild_avatars')
          .select('*', { count: 'exact', head: true })
          .eq('guild_id', guildId)
          .is('withdrawn_at', null)
      : Promise.resolve({ count: null }),
    flags.showBattles
      ? loadTrackedBattleLifetimeCount(guildId)
      : Promise.resolve(null),
    flags.showRegearStats
      ? db
          .from('regear_requests')
          .select('*', { count: 'exact', head: true })
          .eq('guild_id', guildId)
          .eq('status', 'approved')
      : Promise.resolve({ count: null }),
  ])

  return {
    members: typeof members.count === 'number' ? { count: members.count } : null,
    battles: typeof battlesCount === 'number' ? { count: battlesCount } : null,
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

  const displayName = await resolveAlbionDisplayName(tenant.tenantId, tenant.slug, tenant.name)

  // 멤버 대시보드 섹션은 길드별 staged rollout 토글(`member_dashboard_enabled`)
  // 로 게이트한다. 'true' 인 길드만 본인 카드 + 비로그인 CTA 배너 노출. v1 은
  // 멘헤라만 활성, 나머지는 기존 공개 페이지 동작 그대로 유지.
  const memberDashboardEnabled =
    (await getAppSetting('member_dashboard_enabled', 'false', tenant.tenantId)) === 'true'

  // 이번 주 활동 KPI 위젯도 같은 길드별 토글(`home_weekly_stats_enabled`) — 원래
  // 홈(`/`) 페이지에 있던 위젯이 길드 공개 페이지로 이동했다 (#208). 설정 키는
  // 그대로 유지해 기존 길드의 'true' 가 즉시 반영되게 한다.
  const weeklyStatsEnabled =
    (await getAppSetting('home_weekly_stats_enabled', 'false', tenant.tenantId)) === 'true'

  // 세션이 보고 있는 길드 = 페이지 길드 + isMember 일 때만 멤버 카드 데이터를
  // 페치한다. 다른 길드의 멤버나 비로그인은 페치 자체를 건너뛰어 비용 0.
  // 어드민 처리 대기 카드 (HomeAdminPendingCard) 도 같은 토글 + isAdmin 게이트
  // — 길드 공개 페이지가 곧 길드의 홈 페이지 역할을 한다는 전제.
  const session = await getSession()
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
  // 본인 길드의 어드민일 때만 인라인 편집 활성화 — 별도 어드민 폼 대신 페이지
  // 자체에서 클릭 → 편집 → 저장 후 router.refresh() 로 즉시 반영. 일반 길드원
  // (isMember) 에게는 편집 UI 자체가 렌더되지 않아 추가 비용 0.
  const isOwnGuildAdmin =
    session !== null &&
    session.guildId === tenant.tenantId &&
    session.isAdmin === true

  const [
    stats,
    galleryItems,
    recentBattle,
    topContributors,
    memberSummary,
    adminBadges,
    weeklyStats,
    serverCode,
    lifetimeStats,
    weaponDistribution,
    rivals,
    adminTeam,
    alliance,
  ] = await Promise.all([
    loadSectionStats(tenant.tenantId, {
      showMembers: settings.showMembers,
      showBattles: settings.showBattles,
      showRegearStats: settings.showRegearStats,
    }),
    loadGalleryItems(tenant.tenantId),
    settings.showBattles
      ? loadRecentTrackedBattle(tenant.tenantId)
      : Promise.resolve(null),
    settings.showLeaderboard
      ? loadTopContributorsThisWeek(tenant.tenantId, 3)
      : Promise.resolve([]),
    isThisGuildMember && session
      ? loadMemberDashboardSummary(session.discordId, tenant.tenantId)
      : Promise.resolve(null),
    isThisGuildAdmin
      ? getAdminBadgeCounts(tenant.tenantId)
      : Promise.resolve(null),
    weeklyStatsEnabled
      ? loadGuildWeeklyStats(tenant.tenantId)
      : Promise.resolve<GuildWeeklyStats | null>(null),
    // hero 칩 — 어드민 override 가 비어 있으면 albion_server 로 fallback.
    resolveProfileServer(tenant.tenantId, settings.serverOverride),
    // 라이프타임 K/D + 승률 — showBattles 토글에 묶인다.
    settings.showBattles
      ? loadLifetimeBattleStats(tenant.tenantId)
      : Promise.resolve(null),
    // 무기 분포 + 라이벌 — 활동 시그널, showBattles 토글.
    settings.showBattles
      ? loadTopWeaponCategoriesLast30d(tenant.tenantId)
      : Promise.resolve<WeaponCategoryUsage[]>([]),
    settings.showBattles
      ? loadTopRivalsLast30d(tenant.tenantId)
      : Promise.resolve<RivalGuild[]>([]),
    // 어드민 팀 — guild_avatars.is_admin 자동 추출. 토글 없음 (멤버 모집 정보로 항상 유용).
    loadAdminTeam(tenant.tenantId),
    // 연합 태그 — Albion Gameinfo API `/guilds/{id}` 의 AllianceTag. 홈 길드 ID
    // 가 미설정이거나 길드가 alliance 미가입이면 null. 항상 hero 에 노출 (토글 없음).
    loadAllianceInfo(tenant.tenantId, settings.serverOverride),
  ])

  const t = await getTranslations('publicGuildProfile')
  const tTime = await getTranslations('time')
  const tBattle = await getTranslations('battleTracking')
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
  // 언어 코드를 i18n 라벨로 변환. ko/ja/en/zh/es/fr/de/pt 8개.
  const languageLabels = settings.languages.map((code) => t(`language_${code}`))
  const serverLabel = t(`server_${serverCode}`)
  const localeRaw = await getLocale()
  const locale = isLocale(localeRaw) ? localeRaw : 'ko'

  // 인라인 편집 select/csv 용 옵션 — 어드민이 아니면 사용되지 않지만 빌드타임에
  // 풀어두어야 client 컴포넌트가 t() 함수를 안 받는다 (RSC → client prop 룰).
  const recruitmentOptions: EditorOption[] = [
    { value: 'open', label: t('recruitment_open') },
    { value: 'selective', label: t('recruitment_selective') },
    { value: 'closed', label: t('recruitment_closed') },
  ]
  const serverOptions: EditorOption[] = [
    { value: '', label: t('serverDefaultOption') },
    { value: 'east', label: t('server_east') },
    { value: 'west', label: t('server_west') },
    { value: 'europe', label: t('server_europe') },
  ]
  const languageOptions: EditorOption[] = (
    ['ko', 'ja', 'en', 'zh', 'es', 'fr', 'de', 'pt'] as const
  ).map((code) => ({ value: code, label: t(`language_${code}`) }))

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
      {!viewingOwnGuild && <MarketingNav />}

      {/* HERO — 좌측 수직 액센트 바 + 배너 + 글로우 + 미세 노이즈 텍스처.
          모집 open 일 때 도트가 ping. 길드명은 모바일/데스크탑 4xl→6xl→7xl 로
          반응형 점진 확대. */}
      <header className="relative overflow-hidden">
        <BannerInlineEdit
          enabled={isOwnGuildAdmin}
          currentUrl={settings.bannerUrl}
          currentOpacity={settings.bannerOpacity}
        />
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
              className="w-full h-full object-cover"
              style={{ opacity: settings.bannerOpacity / 100 }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-[#08090d]" />
          </div>
        )}
        {/* 미세한 도트 노이즈 — 단조로운 그라디언트에 결을 입힌다. 4% 투명도라
            텍스처는 거의 인지되지 않지만 hero 가 "재질감" 을 갖는다. */}
        <div
          className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '3px 3px',
          }}
        />
        <div className={`absolute top-0 left-0 bottom-0 w-[3px] ${accent.bar}`} />
        <div className={`absolute bottom-0 left-0 right-0 h-px ${accent.divider}`} />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 lg:py-32">
          <div className="space-y-6">
            {/* 연합 태그 — 게임 내 alliance 표시. recruitment pill 보다 한 단계 큰
                pill (text-sm + ring-2) + 명시 라벨로 시각 비중 강조. 미가입 길드는
                자연스레 숨김. AllianceName 은 hover tooltip 으로만 노출. */}
            {alliance && (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-sm font-bold ring-2 backdrop-blur-sm ${accent.badgeBg} ${accent.badgeText} ${accent.badgeRing}`}
                  title={alliance.name ?? undefined}
                >
                  <ShieldCheck size={14} />
                  <span className="text-[10px] uppercase tracking-[0.25em] opacity-80">
                    {t('allianceLabel')}
                  </span>
                  <span className="font-mono tracking-wider text-base">
                    [{alliance.tag}]
                  </span>
                </span>
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap">
              <InlineEditableField
                enabled={isOwnGuildAdmin}
                settingKey="guild_profile_recruitment_status"
                currentValue={settings.recruitmentStatus}
                kind="select"
                options={recruitmentOptions}
                label={t('recruitmentEditLabel')}
                display="inline"
              >
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
              </InlineEditableField>
              <span className="text-gray-500 text-[11px] font-mono tracking-[0.2em] uppercase">
                /g/{tenant.slug}
              </span>
            </div>
            <h1
              className={`text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter ${accent.heading} drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] break-words`}
            >
              {displayName}
            </h1>
            <InlineEditableField
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_description"
              currentValue={settings.description}
              kind="textarea"
              label={t('descriptionEditLabel')}
              emptyLabel={t('descriptionAddLabel')}
              placeholder={t('descriptionPlaceholder')}
              maxLength={500}
            >
              {settings.description.length > 0 && (
                <p className="text-gray-200 text-base sm:text-lg leading-relaxed max-w-2xl whitespace-pre-line">
                  {settings.description}
                </p>
              )}
            </InlineEditableField>
            {/* hero 칩 — 서버 (항상 표시), 활동 시간대 (admin 입력 시), 언어 (admin 입력 시).
                glass + ring 으로 hero 톤 유지. Lucide 아이콘으로 시각 라벨 보강.
                어드민이 본인 길드를 볼 때는 각 칩이 인라인 편집 가능. 빈 칩은
                "+ 추가" 버튼으로 대체된다 (server 는 fallback 이 있어 늘 표시). */}
            <div className="flex flex-wrap items-center gap-2">
              <InlineEditableField
                enabled={isOwnGuildAdmin}
                settingKey="guild_profile_server"
                currentValue={settings.serverOverride}
                kind="select"
                options={serverOptions}
                label={t('serverEditLabel')}
                display="inline"
              >
                <HeroChip icon={<Globe size={12} />} label={serverLabel} accent={accent} />
              </InlineEditableField>
              <InlineEditableField
                enabled={isOwnGuildAdmin}
                settingKey="guild_profile_active_hours"
                currentValue={settings.activeHours}
                kind="text"
                label={t('activeHoursEditLabel')}
                emptyLabel={t('activeHoursAddLabel')}
                placeholder={t('activeHoursPlaceholder')}
                maxLength={80}
                display="inline"
              >
                {settings.activeHours.length > 0 && (
                  <HeroChip
                    icon={<Clock size={12} />}
                    label={settings.activeHours}
                    accent={accent}
                  />
                )}
              </InlineEditableField>
              <InlineEditableField
                enabled={isOwnGuildAdmin}
                settingKey="guild_profile_languages"
                currentValue={settings.languages.join(',')}
                kind="csv"
                options={languageOptions}
                label={t('languagesEditLabel')}
                emptyLabel={t('languagesAddLabel')}
                display="inline"
              >
                {languageLabels.length > 0 && (
                  <HeroChip
                    icon={<Languages size={12} />}
                    label={languageLabels.join(' / ')}
                    accent={accent}
                  />
                )}
              </InlineEditableField>
            </div>
            {/* Discord CTA — 모집 중이고 invite URL 이 채워졌을 때 노출. 어드민
                본인일 때는 url 이 비어 있어도 "+ 추가" 버튼으로 보여 직접 채우게
                한다. recruitment === 'closed' 면 invite 자체가 의미 없어 어드민
                에게도 숨김. */}
            {settings.recruitmentStatus !== 'closed' &&
              (isOwnGuildAdmin || settings.discordInviteUrl.length > 0) && (
                <div className="pt-3">
                  <InlineEditableField
                    enabled={isOwnGuildAdmin}
                    settingKey="guild_profile_discord_invite_url"
                    currentValue={settings.discordInviteUrl}
                    kind="text"
                    label={t('discordInviteEditLabel')}
                    emptyLabel={t('discordInviteAddLabel')}
                    placeholder={t('discordInvitePlaceholder')}
                    maxLength={200}
                  >
                    {settings.discordInviteUrl.length > 0 && (
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
                    )}
                  </InlineEditableField>
                </div>
              )}
          </div>
        </div>
      </header>

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
        {memberDashboardEnabled && !session && (
          <SignedOutCta accent={accent} returnTo={`/g/${tenant.slug}`} />
        )}

        {/* 활동 — 이번 주 KPI 줄 + 최근 추적된 전투 + 이번 주 탑 킬러. 가입을
            고민 중인 사람에게 "지금 살아있는 길드" 라는 인상을 주는 핵심 섹션.
            KPI 줄은 home_weekly_stats_enabled 가 켜진 길드에서만 노출. 다른
            카드(전투/탑 킬러) 둘 중 하나만 있어도 자연스럽게 풀카드로 확장. */}
        {hasActivity && (
          <section className="relative group space-y-4">
            <SectionVisibilityPin
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
            <GalleryInlineEdit enabled={isOwnGuildAdmin} items={galleryItems} />
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

        {/* 통계 카드 — 큰 숫자 + 아이콘 칩 + 코너 글로우 */}
        {hasStats && (
          <section className="relative group space-y-4">
            <SectionVisibilityPin
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
              <InlineEditableField
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
              </InlineEditableField>
              <InlineEditableField
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
              </InlineEditableField>
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
            <InlineEditableField
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
            </InlineEditableField>
          </section>
        )}

        {/* 어드민 팀 — guild_avatars.is_admin = true 인 활성 길드원. 자동 추출. */}
        {showAdminTeam && (
          <section className="relative group space-y-4">
            <SectionVisibilityPin
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
                  <SectionVisibilityPin
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
                  <SectionVisibilityPin
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

        <HiddenSectionsAdminBar enabled={isOwnGuildAdmin} hiddenSections={hiddenSections} />

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
      <span
        className={`inline-block w-1 h-1 rounded-full ${accent.dot} shrink-0 opacity-70`}
      />
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

interface RecentBattleCardProps {
  battle: RecentBattleSummary
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
  sizeLabel: string
  outcomeLabel: string
  relativeLabel: string
  titleLabel: string
  opponentLabel: string
}

// 결과(승/패/무) 색은 액센트와 무관하게 universal 매핑. 길드 액센트가 rose 인
// 경우 패배 카드까지 분홍이면 결과를 못 읽으니 분리.
const OUTCOME_BADGE: Record<BattleOutcome, string> = {
  win: 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/50',
  loss: 'bg-rose-500/20 text-rose-200 ring-rose-500/50',
  tie: 'bg-slate-500/20 text-slate-200 ring-slate-500/50',
}

const OUTCOME_ICON: Record<BattleOutcome, React.ReactNode> = {
  win: <ShieldCheck size={12} />,
  loss: <Skull size={12} />,
  tie: <ShieldAlert size={12} />,
}

function RecentBattleCard({
  battle,
  accent,
  sizeLabel,
  outcomeLabel,
  relativeLabel,
  titleLabel,
  opponentLabel,
}: RecentBattleCardProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold ring-1 uppercase tracking-[0.15em] ${OUTCOME_BADGE[battle.outcome]}`}
        >
          {OUTCOME_ICON[battle.outcome]}
          <span>{outcomeLabel}</span>
        </span>
        <span className="text-[11px] text-gray-500 font-mono shrink-0 tabular-nums">
          {relativeLabel}
        </span>
      </div>
      <div>
        <p
          className={`text-[10px] uppercase tracking-[0.22em] font-bold mb-2 ${accent.heading}`}
        >
          {titleLabel}
        </p>
        <p className="text-lg sm:text-xl font-bold text-white truncate leading-tight">
          {opponentLabel}
        </p>
      </div>
      <div className="flex items-center gap-6 pt-4 border-t border-gray-800">
        <div className="flex items-baseline gap-1.5">
          <Swords size={15} className={`${accent.heading} self-center`} />
          <span className={`text-3xl font-black ${accent.heading} tabular-nums`}>
            {battle.homeKills}
          </span>
          <span className="text-gray-600 text-[11px] font-mono uppercase tracking-wider">
            K
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <Skull size={15} className="text-gray-500 self-center" />
          <span className="text-3xl font-black text-gray-300 tabular-nums">
            {battle.homeDeaths}
          </span>
          <span className="text-gray-600 text-[11px] font-mono uppercase tracking-wider">
            D
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Users size={11} className="text-gray-600" />
          <span className="text-[11px] text-gray-500 font-mono">
            {battle.homeTeamSize} · {sizeLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

interface TopContributorsCardProps {
  contributors: TopContributorSummary[]
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
  titleLabel: string
  killsUnit: string
}

function TopContributorsCard({
  contributors,
  accent,
  titleLabel,
  killsUnit,
}: TopContributorsCardProps) {
  return (
    <div className="space-y-4 h-full flex flex-col">
      <p className={`text-[10px] uppercase tracking-[0.18em] font-bold ${accent.heading}`}>
        {titleLabel}
      </p>
      <ul className="space-y-2.5 flex-1">
        {contributors.map((c, idx) => (
          <li key={c.albionPlayerId} className="flex items-center gap-3">
            <div className="relative shrink-0">
              {c.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.avatarUrl}
                  alt=""
                  className="w-9 h-9 rounded-full bg-gray-800 object-cover"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
                  <Users size={14} className="text-gray-600" />
                </div>
              )}
              {idx === 0 && (
                <Crown
                  size={14}
                  className={`absolute -top-1 -right-1 ${accent.heading} drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}
                  fill="currentColor"
                />
              )}
            </div>
            <span className="flex-1 text-sm text-white font-medium truncate">{c.name}</span>
            <span className="flex items-baseline gap-1 shrink-0">
              <span className={`text-base font-black ${accent.heading}`}>{c.kills}</span>
              <span className="text-gray-500 text-[11px]">{killsUnit}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface HeroChipProps {
  icon: React.ReactNode
  label: string
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
}

// hero 본체에 들어가는 작은 정보 칩. recruitment status 배지와 톤 통일하되
// glow 보다는 차분한 ring 처리 — 정보성이지 강조가 아님.
function HeroChip({ icon, label, accent }: HeroChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ring-1 backdrop-blur-sm ${accent.badgeBg} ${accent.badgeText} ${accent.badgeRing}`}
    >
      <span className="opacity-80">{icon}</span>
      <span className="truncate max-w-[200px]">{label}</span>
    </span>
  )
}

interface InfoCardProps {
  icon: React.ReactNode
  title: string
  body: string
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
}

// 모집 정보 / 가입 절차 카드. 자유 텍스트 멀티라인을 안전하게 렌더 (whitespace-pre-line).
function InfoCard({ icon, title, body, accent }: InfoCardProps) {
  return (
    <div
      className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm transition-colors hover:bg-gray-900/60`}
    >
      <div className={`flex items-center gap-2 ${accent.heading} text-[10px] uppercase tracking-[0.2em] font-bold mb-3`}>
        {icon}
        <span>{title}</span>
      </div>
      <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  )
}

interface WeaponDistributionCardProps {
  weapons: Array<WeaponCategoryUsage & { label: string }>
  totalCount: number
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
  titleLabel: string
  windowLabel: string
}

function WeaponDistributionCard({
  weapons,
  totalCount,
  accent,
  titleLabel,
  windowLabel,
}: WeaponDistributionCardProps) {
  return (
    <div
      className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm space-y-3`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-[10px] uppercase tracking-[0.2em] font-bold ${accent.heading}`}>
          {titleLabel}
        </p>
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
          {windowLabel}
        </span>
      </div>
      <ul className="space-y-2">
        {weapons.map((w) => {
          const pct = totalCount > 0 ? Math.round((w.count / totalCount) * 100) : 0
          return (
            <li key={w.category} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-gray-200 font-medium truncate">{w.label}</span>
                <span className={`shrink-0 font-mono tabular-nums ${accent.heading}`}>{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                <div
                  className={`h-full rounded-full ${accent.dot}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface RivalsCardProps {
  rivals: RivalGuild[]
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
  titleLabel: string
  windowLabel: string
  battlesUnit: string
}

function RivalsCard({
  rivals,
  accent,
  titleLabel,
  windowLabel,
  battlesUnit,
}: RivalsCardProps) {
  return (
    <div
      className={`rounded-xl border ${accent.border} bg-gray-900/40 p-5 backdrop-blur-sm space-y-3`}
    >
      <div className="flex items-center justify-between">
        <p className={`text-[10px] uppercase tracking-[0.2em] font-bold ${accent.heading}`}>
          {titleLabel}
        </p>
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">
          {windowLabel}
        </span>
      </div>
      <ul className="space-y-2.5">
        {rivals.map((r) => (
          <li key={r.guildName} className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-white font-semibold truncate">{r.guildName}</span>
              <span className="text-[11px] text-gray-500 font-mono tabular-nums shrink-0">
                {r.battleCount} {battlesUnit}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-mono">
              <span className="text-emerald-300 tabular-nums">{r.wins}W</span>
              <span className="text-gray-700">·</span>
              <span className="text-rose-300 tabular-nums">{r.losses}L</span>
              {r.ties > 0 && (
                <>
                  <span className="text-gray-700">·</span>
                  <span className="text-gray-400 tabular-nums">{r.ties}T</span>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// K/D 비율 표시 — 한 자리 소수까지. 1.0 미만은 둘째 자리까지 (0.85 가 0.9 가 되면
// 0.9 와 1 의 차가 모호해짐).
function formatRatio(ratio: number): string {
  if (ratio >= 10) return ratio.toFixed(0)
  if (ratio >= 1) return ratio.toFixed(2)
  return ratio.toFixed(2)
}

