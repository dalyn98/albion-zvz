// Public guild profile settings loader. Client-safe constants/types live in
// guild-profile-config; this module adds server DB reads.

import { getAppSetting } from '@/lib/app-settings'
import { toDiscordInviteUrl } from '@/lib/discord-invite-url'
import {
  DEFAULT_BANNER_OPACITY,
  isAccentColor,
  isProfileLanguage,
  isProfileServerOverride,
  isRecruitmentStatus,
  parseBannerOpacity,
  type GuildProfileSettings,
  type ProfileLanguage,
} from '@/lib/guild-profile-config'

export {
  ACCENT_CLASS_MAP,
  ACCENT_COLORS,
  BANNER_OPACITY_OPTIONS,
  DEFAULT_BANNER_OPACITY,
  DEFAULT_GUILD_PROFILE,
  PROFILE_LANGUAGES,
  RECRUITMENT_STATUSES,
  isAccentColor,
  isProfileLanguage,
  isProfileServerOverride,
  isRecruitmentStatus,
  parseBannerOpacity,
} from '@/lib/guild-profile-config'
export type {
  AccentClasses,
  AccentColor,
  GuildProfileSettings,
  ProfileLanguage,
  ProfileServerOverride,
  RecruitmentStatus,
} from '@/lib/guild-profile-config'

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
    youtubeUrl,
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
    getAppSetting('guild_profile_youtube_url', '', guildId),
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
    discordInviteUrl: discordInviteUrl ? toDiscordInviteUrl(discordInviteUrl) ?? '' : '',
    serverOverride: isProfileServerOverride(serverOverrideRaw) ? serverOverrideRaw : '',
    activeHours,
    languages: parseLanguagesCsv(languagesRaw),
    recruitingRoles,
    joinSteps,
    eventSchedule,
    youtubeUrl,
  }
}
