// 공개 길드 프로필 (`/g/<slug>`) 용 설정 로더 + 큐레이션된 색상 팔레트.
// 관리자 화면과 공개 페이지가 같은 키 / 색상 매핑을 보고 있어야 해서 한 곳으로 모음.

import { getAppSetting } from '@/lib/app-settings'

export type AccentColor =
  | 'amber'
  | 'rose'
  | 'emerald'
  | 'sky'
  | 'violet'
  | 'orange'
  | 'pink'
  | 'slate'

export const ACCENT_COLORS: readonly AccentColor[] = [
  'amber',
  'rose',
  'emerald',
  'sky',
  'violet',
  'orange',
  'pink',
  'slate',
] as const

export type RecruitmentStatus = 'open' | 'selective' | 'closed'

export const RECRUITMENT_STATUSES: readonly RecruitmentStatus[] = [
  'open',
  'selective',
  'closed',
] as const

// 각 색상이 hero / 강조 텍스트 / 버튼에 어떻게 풀리는지 한 곳에 모은 매핑.
// Tailwind class 가 빌드타임에 detect 되도록 정적 문자열로만 작성 — 동적 보간 금지.
interface AccentClasses {
  // hero 배경 단색 fallback (배너 미설정 시).
  heroGradient: string
  // hero 위 가장자리 글로우.
  heroGlow: string
  // 강조 텍스트 (길드명, 섹션 헤더의 강조 부분).
  heading: string
  // 메인 CTA 버튼 — 배경 + hover.
  ctaBg: string
  // 모집 상태 배지.
  badgeBg: string
  badgeText: string
  badgeRing: string
  // 카드 / 섹션 강조 라인.
  border: string
  // dot
  dot: string
  // hero 좌측 수직 액센트 바 (위→아래 페이드).
  bar: string
  // 섹션 구분 수평 라인 (좌우 페이드).
  divider: string
}

export const ACCENT_CLASS_MAP: Record<AccentColor, AccentClasses> = {
  amber: {
    heroGradient: 'bg-gradient-to-br from-amber-500/30 via-orange-700/20 to-black',
    heroGlow: 'bg-amber-500/20',
    heading: 'text-amber-300',
    ctaBg: 'bg-amber-500 hover:bg-amber-400 text-black',
    badgeBg: 'bg-amber-500/15',
    badgeText: 'text-amber-200',
    badgeRing: 'ring-amber-500/40',
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    bar: 'bg-gradient-to-b from-amber-400 via-amber-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-amber-500/40 to-transparent',
  },
  rose: {
    heroGradient: 'bg-gradient-to-br from-rose-500/30 via-rose-800/20 to-black',
    heroGlow: 'bg-rose-500/20',
    heading: 'text-rose-300',
    ctaBg: 'bg-rose-500 hover:bg-rose-400 text-white',
    badgeBg: 'bg-rose-500/15',
    badgeText: 'text-rose-200',
    badgeRing: 'ring-rose-500/40',
    border: 'border-rose-500/30',
    dot: 'bg-rose-400',
    bar: 'bg-gradient-to-b from-rose-400 via-rose-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-rose-500/40 to-transparent',
  },
  emerald: {
    heroGradient: 'bg-gradient-to-br from-emerald-500/30 via-teal-800/20 to-black',
    heroGlow: 'bg-emerald-500/20',
    heading: 'text-emerald-300',
    ctaBg: 'bg-emerald-500 hover:bg-emerald-400 text-black',
    badgeBg: 'bg-emerald-500/15',
    badgeText: 'text-emerald-200',
    badgeRing: 'ring-emerald-500/40',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-400',
    bar: 'bg-gradient-to-b from-emerald-400 via-emerald-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent',
  },
  sky: {
    heroGradient: 'bg-gradient-to-br from-sky-500/30 via-blue-800/20 to-black',
    heroGlow: 'bg-sky-500/20',
    heading: 'text-sky-300',
    ctaBg: 'bg-sky-500 hover:bg-sky-400 text-white',
    badgeBg: 'bg-sky-500/15',
    badgeText: 'text-sky-200',
    badgeRing: 'ring-sky-500/40',
    border: 'border-sky-500/30',
    dot: 'bg-sky-400',
    bar: 'bg-gradient-to-b from-sky-400 via-sky-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-sky-500/40 to-transparent',
  },
  violet: {
    heroGradient: 'bg-gradient-to-br from-violet-500/30 via-purple-800/20 to-black',
    heroGlow: 'bg-violet-500/20',
    heading: 'text-violet-300',
    ctaBg: 'bg-violet-500 hover:bg-violet-400 text-white',
    badgeBg: 'bg-violet-500/15',
    badgeText: 'text-violet-200',
    badgeRing: 'ring-violet-500/40',
    border: 'border-violet-500/30',
    dot: 'bg-violet-400',
    bar: 'bg-gradient-to-b from-violet-400 via-violet-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-violet-500/40 to-transparent',
  },
  orange: {
    heroGradient: 'bg-gradient-to-br from-orange-500/30 via-red-800/20 to-black',
    heroGlow: 'bg-orange-500/20',
    heading: 'text-orange-300',
    ctaBg: 'bg-orange-500 hover:bg-orange-400 text-black',
    badgeBg: 'bg-orange-500/15',
    badgeText: 'text-orange-200',
    badgeRing: 'ring-orange-500/40',
    border: 'border-orange-500/30',
    dot: 'bg-orange-400',
    bar: 'bg-gradient-to-b from-orange-400 via-orange-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-orange-500/40 to-transparent',
  },
  pink: {
    heroGradient: 'bg-gradient-to-br from-pink-500/30 via-fuchsia-800/20 to-black',
    heroGlow: 'bg-pink-500/20',
    heading: 'text-pink-300',
    ctaBg: 'bg-pink-500 hover:bg-pink-400 text-white',
    badgeBg: 'bg-pink-500/15',
    badgeText: 'text-pink-200',
    badgeRing: 'ring-pink-500/40',
    border: 'border-pink-500/30',
    dot: 'bg-pink-400',
    bar: 'bg-gradient-to-b from-pink-400 via-pink-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-pink-500/40 to-transparent',
  },
  slate: {
    heroGradient: 'bg-gradient-to-br from-slate-500/30 via-gray-800/20 to-black',
    heroGlow: 'bg-slate-400/20',
    heading: 'text-slate-200',
    ctaBg: 'bg-slate-500 hover:bg-slate-400 text-white',
    badgeBg: 'bg-slate-500/15',
    badgeText: 'text-slate-100',
    badgeRing: 'ring-slate-500/40',
    border: 'border-slate-500/30',
    dot: 'bg-slate-400',
    bar: 'bg-gradient-to-b from-slate-300 via-slate-500/40 to-transparent',
    divider: 'bg-gradient-to-r from-transparent via-slate-500/40 to-transparent',
  },
}

export function isAccentColor(value: string): value is AccentColor {
  return (ACCENT_COLORS as readonly string[]).includes(value)
}

export function isRecruitmentStatus(value: string): value is RecruitmentStatus {
  return (RECRUITMENT_STATUSES as readonly string[]).includes(value)
}

// 사용 언어 코드 — 길드 공개 페이지 hero 칩에 풀어 노출. 알비온이 공식
// 지원하는 언어 + 한국어 (지역 길드 운영 환경 반영). 어드민이 csv 로 저장,
// 표시 시 i18n 라벨로 변환.
export type ProfileLanguage = 'ko' | 'ja' | 'en' | 'zh' | 'es' | 'fr' | 'de' | 'pt'

export const PROFILE_LANGUAGES: readonly ProfileLanguage[] = [
  'ko',
  'ja',
  'en',
  'zh',
  'es',
  'fr',
  'de',
  'pt',
] as const

export function isProfileLanguage(value: string): value is ProfileLanguage {
  return (PROFILE_LANGUAGES as readonly string[]).includes(value)
}

// 어드민이 명시 override 하지 않으면 빈 문자열. 빈 값일 때 호출자는
// albion_guild_members.albion_server 의 majority 를 자동 감지해 채운다.
export type ProfileServerOverride = '' | 'east' | 'west' | 'europe'

export function isProfileServerOverride(value: string): value is ProfileServerOverride {
  return value === '' || value === 'east' || value === 'west' || value === 'europe'
}

// hero 배너 image opacity 의 사용 가능한 단계. 0 ~ 100 사이라면 클라이언트 측
// inline style 로 무엇이든 적용 가능하지만, 어드민이 빠르게 고를 수 있도록
// discrete 옵션으로 제한 — 슬라이더보다 클릭 한 번이 빠르고 결과가 예측 가능.
export const BANNER_OPACITY_OPTIONS: readonly number[] = [30, 50, 70, 90, 100] as const

export const DEFAULT_BANNER_OPACITY = 50

function parseBannerOpacity(raw: string): number {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_BANNER_OPACITY
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

export interface GuildProfileSettings {
  enabled: boolean
  bannerUrl: string
  // 배너 이미지의 가시성 (0~100). hero 위에 깔리는 어두운 그라데이션은 그대로
  // 두고 배너 자체의 opacity 만 조정한다 — 텍스트 가독성을 깨지 않도록.
  bannerOpacity: number
  description: string
  accentColor: AccentColor
  showMembers: boolean
  showBattles: boolean
  showRegearStats: boolean
  showLeaderboard: boolean
  // 큰 통계 섹션 자체 노출. 하위 4개 (members/battles/regear/leaderboard) 가
  // 모두 켜져있어도 이 토글이 false 면 섹션 자체 숨김.
  showStats: boolean
  // 운영진 카드 (자동 추출되는 is_admin 멤버 목록) 노출.
  showAdminTeam: boolean
  // 무기 분포 카드 (최근 30일 카테고리 사용 비율).
  showWeapons: boolean
  // 라이벌 길드 카드 (최근 30일 빈도).
  showRivals: boolean
  // "지금 길드는" 활동 섹션 (이번 주 KPI + 최근 전투 + 탑 킬러) 마스터 토글.
  showActivity: boolean
  recruitmentStatus: RecruitmentStatus
  discordInviteUrl: string
  // 어드민이 명시한 서버 override. 빈 문자열이면 자동 감지(majority).
  serverOverride: ProfileServerOverride
  // 활동 시간대 자유 텍스트. 빈 값 = hero 칩 숨김.
  activeHours: string
  // 사용 언어 화이트리스트. 어드민이 csv 로 저장하지만 로더에서 배열로 풀어서
  // 반환 — 호출자가 직접 split 하지 않게 한다.
  languages: ProfileLanguage[]
  // 모집 중인 포지션 자유 텍스트. recruitment_status === 'closed' 면 호출자가
  // UI 에서 숨김.
  recruitingRoles: string
  // 가입 절차 한 줄 요약. 빈 값 = 카드 숨김.
  joinSteps: string
  // 정기 이벤트 일정 자유 텍스트 (멀티라인 허용). 빈 값 = 섹션 숨김.
  eventSchedule: string
}

export const DEFAULT_GUILD_PROFILE: GuildProfileSettings = {
  enabled: false,
  bannerUrl: '',
  bannerOpacity: DEFAULT_BANNER_OPACITY,
  description: '',
  accentColor: 'amber',
  showMembers: true,
  showBattles: true,
  showRegearStats: false,
  showLeaderboard: true,
  showStats: true,
  showAdminTeam: true,
  showActivity: true,
  showWeapons: true,
  showRivals: true,
  recruitmentStatus: 'closed',
  discordInviteUrl: '',
  serverOverride: '',
  activeHours: '',
  languages: [],
  recruitingRoles: '',
  joinSteps: '',
  eventSchedule: '',
}

// csv → string[]. 알 수 없는 코드는 무시 (저장 시점 검증을 통과한 값만 들어와야
// 정상이지만, 누군가 SQL 직접 수정한 경우에 대비).
function parseLanguagesCsv(raw: string): ProfileLanguage[] {
  if (!raw) return []
  const out: ProfileLanguage[] = []
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim()
    if (isProfileLanguage(trimmed) && !out.includes(trimmed)) {
      out.push(trimmed)
    }
  }
  return out
}

// 모든 길드 프로필 설정을 한 번의 병렬 조회로 모은다. /g/<slug> 와 어드민 폼이
// 같은 함수를 호출.
export async function loadGuildProfileSettings(guildId: string): Promise<GuildProfileSettings> {
  const [
    enabledRaw,
    bannerUrl,
    bannerOpacityRaw,
    description,
    accentColorRaw,
    showMembersRaw,
    showBattlesRaw,
    showRegearStatsRaw,
    showLeaderboardRaw,
    showStatsRaw,
    showAdminTeamRaw,
    showWeaponsRaw,
    showRivalsRaw,
    showActivityRaw,
    recruitmentStatusRaw,
    discordInviteUrl,
    serverOverrideRaw,
    activeHours,
    languagesRaw,
    recruitingRoles,
    joinSteps,
    eventSchedule,
  ] = await Promise.all([
    getAppSetting('guild_profile_enabled', 'false', guildId),
    getAppSetting('guild_profile_banner_url', '', guildId),
    getAppSetting('guild_profile_banner_opacity', String(DEFAULT_BANNER_OPACITY), guildId),
    getAppSetting('guild_profile_description', '', guildId),
    getAppSetting('guild_profile_accent_color', 'amber', guildId),
    getAppSetting('guild_profile_show_members', 'true', guildId),
    getAppSetting('guild_profile_show_battles', 'true', guildId),
    getAppSetting('guild_profile_show_regear_stats', 'false', guildId),
    getAppSetting('guild_profile_show_leaderboard', 'true', guildId),
    getAppSetting('guild_profile_show_stats', 'true', guildId),
    getAppSetting('guild_profile_show_admin_team', 'true', guildId),
    getAppSetting('guild_profile_show_weapons', 'true', guildId),
    getAppSetting('guild_profile_show_rivals', 'true', guildId),
    getAppSetting('guild_profile_show_activity', 'true', guildId),
    getAppSetting('guild_profile_recruitment_status', 'closed', guildId),
    getAppSetting('guild_profile_discord_invite_url', '', guildId),
    getAppSetting('guild_profile_server', '', guildId),
    getAppSetting('guild_profile_active_hours', '', guildId),
    getAppSetting('guild_profile_languages', '', guildId),
    getAppSetting('guild_profile_recruiting_roles', '', guildId),
    getAppSetting('guild_profile_join_steps', '', guildId),
    getAppSetting('guild_profile_event_schedule', '', guildId),
  ])

  return {
    enabled: enabledRaw === 'true',
    bannerUrl,
    bannerOpacity: parseBannerOpacity(bannerOpacityRaw),
    description,
    accentColor: isAccentColor(accentColorRaw) ? accentColorRaw : 'amber',
    showMembers: showMembersRaw !== 'false',
    showBattles: showBattlesRaw !== 'false',
    showRegearStats: showRegearStatsRaw === 'true',
    showLeaderboard: showLeaderboardRaw !== 'false',
    showStats: showStatsRaw !== 'false',
    showAdminTeam: showAdminTeamRaw !== 'false',
    showWeapons: showWeaponsRaw !== 'false',
    showRivals: showRivalsRaw !== 'false',
    showActivity: showActivityRaw !== 'false',
    recruitmentStatus: isRecruitmentStatus(recruitmentStatusRaw) ? recruitmentStatusRaw : 'closed',
    discordInviteUrl,
    serverOverride: isProfileServerOverride(serverOverrideRaw) ? serverOverrideRaw : '',
    activeHours,
    languages: parseLanguagesCsv(languagesRaw),
    recruitingRoles,
    joinSteps,
    eventSchedule,
  }
}
