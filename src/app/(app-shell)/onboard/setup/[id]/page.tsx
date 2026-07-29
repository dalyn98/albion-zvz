import { getTranslations } from 'next-intl/server'
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

// Discord permissions 문자열(10진 정수) 을 BigInt 로 파싱해 관리자 권한 비트를
// 가지고 있는지 판단. permissions 가 없거나 파싱 실패면 false.
// ES2020 미만 target 이라 BigInt 리터럴(1n) 대신 BigInt(x) 생성자를 쓴다.
const ADMINISTRATOR_BIT = BigInt(1) << BigInt(3)
const MANAGE_GUILD_BIT = BigInt(1) << BigInt(5)
const ZERO_BIG = BigInt(0)

function hasAdminPermissionBit(permissions?: string): boolean {
  if (!permissions) return false
  try {
    const bits = BigInt(permissions)
    return (bits & ADMINISTRATOR_BIT) !== ZERO_BIG || (bits & MANAGE_GUILD_BIT) !== ZERO_BIG
  } catch {
    return false
  }
}

interface DiscordChannelOption {
  id: string
  name: string
  position: number
  parent_id: string | null
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

// /onboard/setup/[id] — 위저드 1단계: Discord 역할 + 공지 채널. 세션·소유권 검증은
// layout.tsx 가 담당하고, 여기서는 discord_guild_id 만 다시 불러 Discord API 로
// 역할/채널 후보를 프리로드한다.

interface Props {
  params: Promise<{ id: string }>
}

export default async function TenantSetupPage({ params }: Props) {
  const { id } = await params

  const db = getAdminClient()
  const { data: tenantRow } = await db
    .from('tenants')
    .select('discord_guild_id')
    .eq('id', id)
    .maybeSingle()
  const discordGuildId = (tenantRow?.discord_guild_id ?? '') as string

  const t = await getTranslations('onboard')

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
          hasAdminPerm: hasAdminPermissionBit(r.permissions),
        }))
        .sort((a, b) => b.position - a.position)
    } else {
      logDiscordSetupLoadFailure(rolesResult.reason, discordGuildId)
    }
    if (channelsResult.status === 'fulfilled') {
      channels = channelsResult.value
        .filter((c: RawDiscordChannel) => c.type === 0 || c.type === 5)
        .map((c: RawDiscordChannel) => ({
          id: c.id,
          name: c.name,
          position: c.position,
          parent_id: c.parent_id,
        }))
        .sort((a, b) => a.position - b.position)
    } else {
      logDiscordSetupLoadFailure(channelsResult.reason, discordGuildId)
    }
  }

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
        labels={{
          memberRoleLabel: t('memberRoleLabel'),
          memberRoleHelp: t('memberRoleHelp'),
          adminRoleLabel: t('adminRoleLabel'),
          adminRoleHelp: t('adminRoleHelp'),
          adminRoleLockoutWarn: t('adminRoleLockoutWarn'),
          adminRoleAutoPreselectHint: t('adminRoleAutoPreselectHint'),
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
