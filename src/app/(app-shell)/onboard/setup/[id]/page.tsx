import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase-admin'
import TenantSetupForm from '@/components/TenantSetupForm'
import {
  fetchDiscordGuildChannels,
  fetchDiscordGuildRoles,
  isDiscordGuildResourceError,
  type RawDiscordChannel,
  type RawDiscordRole,
} from '@/lib/discord-guild-resources'
import { log } from '@/lib/log'
import { getAppSetting } from '@/lib/app-settings'
import { isValidTenantTimezone } from '@/lib/timezone'
import {
  hasDiscordAdminPermission,
  recommendDiscordOnboardingResources,
} from '@/lib/discord-onboarding-recommendations'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

interface DiscordRoleOption {
  id: string
  name: string
  color: number
  position: number
  // ADMINISTRATOR (0x8) 또는 MANAGE_GUILD (0x20) 이면 true — UI 에서 관리자
  // 역할로 프리체크할 후보.
  hasAdminPerm: boolean
}

interface DiscordChannelOption {
  id: string
  name: string
  position: number
  parent_id: string | null
  parentName: string | null
  type: number
}

function logDiscordSetupLoadFailure(error: unknown, discordGuildId: string): void {
  if (isDiscordGuildResourceError(error)) {
    log.error('[onboard/setup] failed to load Discord guild resource', undefined, {
      discord_guild_id: discordGuildId,
      resource: error.resource,
      status: error.status,
      response: error.response,
    })
    return
  }
  log.error('[onboard/setup] failed to load Discord guild resource', error, {
    discord_guild_id: discordGuildId,
  })
}

// /onboard/setup/[id] — 위저드 1단계: Discord 역할 + 공지 채널. 상위 layout 과
// 별개로 페이지도 소유권을 다시 검증한 뒤 Discord 역할/채널 후보를 프리로드한다.

interface Props {
  params: Promise<{ id: string }>
}

export default async function TenantSetupPage({ params }: Props) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/onboard/setup/${id}`)}`)
  }

  const db = getAdminClient()
  const { data: tenantRow } = await db
    .from('tenants')
    .select('discord_guild_id, member_role_ids, admin_role_ids, event_channel_id')
    .eq('id', id)
    .eq('created_by_discord_id', session.discordId)
    .maybeSingle()
  if (!tenantRow) redirect('/onboard')

  const [savedTimezone, t] = await Promise.all([
    getAppSetting('tenant_timezone', '', id),
    getTranslations('onboard'),
  ])
  const discordGuildId = tenantRow.discord_guild_id as string

  // Discord 역할/채널 프리로드. 실패하면 빈 배열로 대체하고 폼에서 안내.
  let roles: DiscordRoleOption[] = []
  let channels: DiscordChannelOption[] = []
  if (discordGuildId) {
    const [rolesResult, channelsResult] = await Promise.allSettled([
      fetchDiscordGuildRoles(discordGuildId),
      fetchDiscordGuildChannels(discordGuildId),
    ])
    if (rolesResult.status === 'fulfilled') {
      roles = rolesResult.value
        .filter((r: RawDiscordRole) => r.id !== discordGuildId && !r.managed)
        .map((r: RawDiscordRole) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          position: r.position,
          hasAdminPerm: hasDiscordAdminPermission(r.permissions),
        }))
        .sort((a, b) => b.position - a.position)
    } else {
      logDiscordSetupLoadFailure(rolesResult.reason, discordGuildId)
    }
    if (channelsResult.status === 'fulfilled') {
      const categoryNames = new Map(
        channelsResult.value
          .filter((channel: RawDiscordChannel) => channel.type === 4)
          .map((category: RawDiscordChannel) => [category.id, category.name]),
      )
      channels = channelsResult.value
        .filter((c: RawDiscordChannel) => c.type === 0 || c.type === 5)
        .map((c: RawDiscordChannel) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          parent_id: c.parent_id,
          parentName: c.parent_id ? categoryNames.get(c.parent_id) ?? null : null,
          type: c.type,
        }))
        .sort((a, b) => a.position - b.position)
    } else {
      logDiscordSetupLoadFailure(channelsResult.reason, discordGuildId)
    }
  }

  const recommendations = recommendDiscordOnboardingResources(roles, channels)
  const availableRoleIds = new Set(roles.map((role) => role.id))
  const availableChannelIds = new Set(channels.map((channel) => channel.id))
  const savedMemberRoleIds = Array.isArray(tenantRow?.member_role_ids)
    ? tenantRow.member_role_ids.filter((roleId): roleId is string =>
        typeof roleId === 'string' && availableRoleIds.has(roleId),
      )
    : []
  const savedAdminRoleIds = Array.isArray(tenantRow?.admin_role_ids)
    ? tenantRow.admin_role_ids.filter((roleId): roleId is string =>
        typeof roleId === 'string' && availableRoleIds.has(roleId),
      )
    : []
  const savedEventChannelId =
    typeof tenantRow?.event_channel_id === 'string' &&
    availableChannelIds.has(tenantRow.event_channel_id)
      ? tenantRow.event_channel_id
      : ''

  return (
    <>
      <div className="space-y-2 mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-white">{t('setupTitle')}</h1>
        <p className="text-sm text-gray-400">{t('setupDescription')}</p>
      </div>
      <TenantSetupForm
        tenantId={id}
        roles={roles}
        channels={channels}
        recommendations={recommendations}
        initialSelection={{
          memberRoleIds: savedMemberRoleIds,
          adminRoleIds: savedAdminRoleIds,
          eventChannelId: savedEventChannelId,
          timezone: isValidTenantTimezone(savedTimezone) ? savedTimezone : '',
        }}
        labels={{
          memberRoleLabel: t('memberRoleLabel'),
          memberRoleHelp: t('memberRoleHelp'),
          adminRoleLabel: t('adminRoleLabel'),
          adminRoleHelp: t('adminRoleHelp'),
          adminRoleLockoutWarn: t('adminRoleLockoutWarn'),
          adminRoleAutoPreselectHint: t('adminRoleAutoPreselectHint'),
          memberRoleAutoPreselectHint: t('memberRoleAutoPreselectHint'),
          channelAutoPreselectHint: t('channelAutoPreselectHint'),
          recommendedBadge: t('recommendedBadge'),
          roleSearchPlaceholder: t('roleSearchPlaceholder'),
          roleSearchNoResults: t('roleSearchNoResults'),
          channelLabel: t('channelLabel'),
          channelHelp: t('channelHelp'),
          channelPermissionTitle: t('channelPermissionTitle'),
          channelPermissionBody: t('channelPermissionBody'),
          noChannel: t('noChannel'),
          missingEventChannel: t('missingEventChannel'),
          timezoneLabel: t('timezoneLabel'),
          timezoneHelp: t('timezoneHelp'),
          timezoneRequired: t('timezoneRequired'),
          timezone_kr: t('timezone_kr'),
          timezone_eu: t('timezone_eu'),
          timezone_na: t('timezone_na'),
          timezone_sa: t('timezone_sa'),
          nextButton: t('nextButton'),
          savingButton: t('savingButton'),
          errorGeneric: t('errorGeneric'),
          missingRoles: t('missingRoles'),
          missingAdminRoles: t('missingAdminRoles'),
        }}
      />
    </>
  )
}
