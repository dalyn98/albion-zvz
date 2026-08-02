import {
  isProfileLanguage,
  isProfileServerOverride,
  isRecruitmentStatus,
  type ProfileLanguage,
  type ProfileServerOverride,
  type RecruitmentStatus,
} from '@/lib/guild-profile-config'

export const PUBLIC_GUILD_DIRECTORY_SETTING_KEYS = [
  'albion_home_guild_name',
  'albion_server',
  'guild_profile_enabled',
  'guild_profile_description',
  'guild_profile_recruitment_status',
  'guild_profile_server',
  'guild_profile_active_hours',
  'guild_profile_languages',
  'guild_profile_recruiting_roles',
  'guild_profile_event_schedule',
] as const

type DirectorySettingKey = (typeof PUBLIC_GUILD_DIRECTORY_SETTING_KEYS)[number]

export interface PublicGuildDirectoryTenantRow {
  id: string
  slug: string
  name: string
  status: string
}

export interface PublicGuildDirectorySettingRow {
  guild_id: string
  key: string
  value: string
}

export interface PublicGuildDirectoryFeatureRow {
  guild_id: string
  feature_key: string
  state: string
}

export interface PublicGuildDirectoryDisputeRow {
  incumbent_guild_id: string
  status: string
}

export interface PublicGuildDirectoryEntry {
  slug: string
  name: string
  server: Exclude<ProfileServerOverride, ''> | null
  recruitmentStatus: Exclude<RecruitmentStatus, 'closed'>
  description: string
  activeHours: string
  languages: ProfileLanguage[]
  recruitingRoles: string
  eventSchedule: string
}

export interface PublicGuildDirectoryFilters {
  query: string
  server: '' | Exclude<ProfileServerOverride, ''>
  recruitmentStatus: '' | Exclude<RecruitmentStatus, 'closed'>
  language: '' | ProfileLanguage
}

function buildSettingMap(
  settings: readonly PublicGuildDirectorySettingRow[],
): Map<string, Map<DirectorySettingKey, string>> {
  const out = new Map<string, Map<DirectorySettingKey, string>>()
  const allowed = new Set<string>(PUBLIC_GUILD_DIRECTORY_SETTING_KEYS)
  for (const row of settings) {
    if (!allowed.has(row.key)) continue
    const guildSettings = out.get(row.guild_id) ?? new Map<DirectorySettingKey, string>()
    guildSettings.set(row.key as DirectorySettingKey, row.value)
    out.set(row.guild_id, guildSettings)
  }
  return out
}

function parseLanguages(raw: string): ProfileLanguage[] {
  const languages: ProfileLanguage[] = []
  for (const candidate of raw.split(',').map((value) => value.trim())) {
    if (isProfileLanguage(candidate) && !languages.includes(candidate)) {
      languages.push(candidate)
    }
  }
  return languages
}

function resolveServer(
  profileOverride: string,
  defaultServer: string,
): PublicGuildDirectoryEntry['server'] {
  const candidate = profileOverride.trim() || defaultServer.trim()
  return isProfileServerOverride(candidate) && candidate !== '' ? candidate : null
}

export function buildPublicGuildDirectoryEntries(input: {
  tenants: readonly PublicGuildDirectoryTenantRow[]
  settings: readonly PublicGuildDirectorySettingRow[]
  features: readonly PublicGuildDirectoryFeatureRow[]
  disputes: readonly PublicGuildDirectoryDisputeRow[]
}): PublicGuildDirectoryEntry[] {
  const settingMap = buildSettingMap(input.settings)
  const enabledFeatureGuildIds = new Set(
    input.features
      .filter((row) => row.feature_key === 'public_guild_profile' && row.state === 'enabled')
      .map((row) => row.guild_id),
  )
  const disputedGuildIds = new Set(
    input.disputes
      .filter((row) => row.status === 'under_review')
      .map((row) => row.incumbent_guild_id),
  )
  const entries: PublicGuildDirectoryEntry[] = []

  for (const tenant of input.tenants) {
    if (
      tenant.status !== 'active'
      || !tenant.slug.trim()
      || disputedGuildIds.has(tenant.id)
      || !enabledFeatureGuildIds.has(tenant.id)
    ) {
      continue
    }

    const settings = settingMap.get(tenant.id)
    if (settings?.get('guild_profile_enabled') !== 'true') continue
    const recruitmentStatusRaw = settings.get('guild_profile_recruitment_status') ?? 'closed'
    if (
      !isRecruitmentStatus(recruitmentStatusRaw)
      || recruitmentStatusRaw === 'closed'
    ) {
      continue
    }

    entries.push({
      slug: tenant.slug.trim(),
      name: settings.get('albion_home_guild_name')?.trim() || tenant.name.trim() || tenant.slug.trim(),
      server: resolveServer(
        settings.get('guild_profile_server') ?? '',
        settings.get('albion_server') ?? '',
      ),
      recruitmentStatus: recruitmentStatusRaw,
      description: settings.get('guild_profile_description')?.trim() ?? '',
      activeHours: settings.get('guild_profile_active_hours')?.trim() ?? '',
      languages: parseLanguages(settings.get('guild_profile_languages') ?? ''),
      recruitingRoles: settings.get('guild_profile_recruiting_roles')?.trim() ?? '',
      eventSchedule: settings.get('guild_profile_event_schedule')?.trim() ?? '',
    })
  }

  return entries.sort((left, right) => {
    if (left.recruitmentStatus !== right.recruitmentStatus) {
      return left.recruitmentStatus === 'open' ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'en', { sensitivity: 'base' })
      || left.slug.localeCompare(right.slug)
  })
}

export function filterPublicGuildDirectoryEntries(
  entries: readonly PublicGuildDirectoryEntry[],
  filters: PublicGuildDirectoryFilters,
): PublicGuildDirectoryEntry[] {
  const query = filters.query.trim().toLocaleLowerCase()
  return entries.filter((entry) => {
    if (filters.server && entry.server !== filters.server) return false
    if (
      filters.recruitmentStatus
      && entry.recruitmentStatus !== filters.recruitmentStatus
    ) return false
    if (filters.language && !entry.languages.includes(filters.language)) return false
    if (!query) return true
    return [
      entry.name,
      entry.description,
      entry.activeHours,
      entry.recruitingRoles,
      entry.eventSchedule,
      entry.languages.join(' '),
      entry.server ?? '',
    ].some((value) => value.toLocaleLowerCase().includes(query))
  })
}
