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

export interface AccentClasses {
  heroGradient: string
  heroGlow: string
  heading: string
  ctaBg: string
  badgeBg: string
  badgeText: string
  badgeRing: string
  border: string
  dot: string
  bar: string
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

export type ProfileServerOverride = '' | 'east' | 'west' | 'europe'

export function isProfileServerOverride(value: string): value is ProfileServerOverride {
  return value === '' || value === 'east' || value === 'west' || value === 'europe'
}

export const BANNER_OPACITY_OPTIONS: readonly number[] = [30, 50, 70, 90, 100] as const

export const DEFAULT_BANNER_OPACITY = 50

export function parseBannerOpacity(raw: string): number {
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return DEFAULT_BANNER_OPACITY
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

export interface GuildProfileSettings {
  enabled: boolean
  bannerUrl: string
  bannerOpacity: number
  description: string
  accentColor: AccentColor
  showMembers: boolean
  showBattles: boolean
  showRegearStats: boolean
  showLeaderboard: boolean
  showStats: boolean
  showAdminTeam: boolean
  showWeapons: boolean
  showRivals: boolean
  showActivity: boolean
  recruitmentStatus: RecruitmentStatus
  discordInviteUrl: string
  serverOverride: ProfileServerOverride
  activeHours: string
  languages: ProfileLanguage[]
  recruitingRoles: string
  joinSteps: string
  eventSchedule: string
  youtubeUrl: string
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
  youtubeUrl: '',
}
