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

export interface GuildProfileSettings {
  enabled: boolean
  bannerUrl: string
  description: string
  accentColor: AccentColor
  showMembers: boolean
  showBattles: boolean
  showRegearStats: boolean
  showLeaderboard: boolean
  recruitmentStatus: RecruitmentStatus
  discordInviteUrl: string
}

export const DEFAULT_GUILD_PROFILE: GuildProfileSettings = {
  enabled: false,
  bannerUrl: '',
  description: '',
  accentColor: 'amber',
  showMembers: true,
  showBattles: true,
  showRegearStats: false,
  showLeaderboard: true,
  recruitmentStatus: 'closed',
  discordInviteUrl: '',
}

// 모든 길드 프로필 설정을 한 번의 병렬 조회로 모은다. /g/<slug> 와 어드민 폼이
// 같은 함수를 호출.
export async function loadGuildProfileSettings(guildId: string): Promise<GuildProfileSettings> {
  const [
    enabledRaw,
    bannerUrl,
    description,
    accentColorRaw,
    showMembersRaw,
    showBattlesRaw,
    showRegearStatsRaw,
    showLeaderboardRaw,
    recruitmentStatusRaw,
    discordInviteUrl,
  ] = await Promise.all([
    getAppSetting('guild_profile_enabled', 'false', guildId),
    getAppSetting('guild_profile_banner_url', '', guildId),
    getAppSetting('guild_profile_description', '', guildId),
    getAppSetting('guild_profile_accent_color', 'amber', guildId),
    getAppSetting('guild_profile_show_members', 'true', guildId),
    getAppSetting('guild_profile_show_battles', 'true', guildId),
    getAppSetting('guild_profile_show_regear_stats', 'false', guildId),
    getAppSetting('guild_profile_show_leaderboard', 'true', guildId),
    getAppSetting('guild_profile_recruitment_status', 'closed', guildId),
    getAppSetting('guild_profile_discord_invite_url', '', guildId),
  ])

  return {
    enabled: enabledRaw === 'true',
    bannerUrl,
    description,
    accentColor: isAccentColor(accentColorRaw) ? accentColorRaw : 'amber',
    showMembers: showMembersRaw !== 'false',
    showBattles: showBattlesRaw !== 'false',
    showRegearStats: showRegearStatsRaw === 'true',
    showLeaderboard: showLeaderboardRaw !== 'false',
    recruitmentStatus: isRecruitmentStatus(recruitmentStatusRaw) ? recruitmentStatusRaw : 'closed',
    discordInviteUrl,
  }
}
