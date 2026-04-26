import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getCanonicalRootDomain } from '@/lib/tenant-resolver'
import TenantSetupForm from '@/components/TenantSetupForm'

export const dynamic = 'force-dynamic'

interface RawDiscordRole {
  id: string
  name: string
  color: number
  position: number
  managed?: boolean
  // Discord permission bitmask as decimal string ("8" = ADMINISTRATOR).
  permissions?: string
}

interface RawDiscordChannel {
  id: string
  name: string
  type: number
  position: number
  parent_id: string | null
}

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
    .select('discord_guild_id, slug')
    .eq('id', id)
    .maybeSingle()
  const discordGuildId = (tenantRow?.discord_guild_id ?? '') as string
  const initialSlug = (tenantRow?.slug ?? '') as string
  const rootDomain = getCanonicalRootDomain()

  const t = await getTranslations('onboard')

  // Discord 역할/채널 프리로드. 실패하면 빈 배열로 대체하고 폼에서 안내.
  const botToken = process.env.DISCORD_BOT_TOKEN
  let roles: DiscordRoleOption[] = []
  let channels: DiscordChannelOption[] = []
  if (botToken && discordGuildId) {
    try {
      const [rolesRes, channelsRes] = await Promise.all([
        fetch(`https://discord.com/api/v10/guilds/${discordGuildId}/roles`, {
          headers: { Authorization: `Bot ${botToken}` },
          cache: 'no-store',
        }),
        fetch(`https://discord.com/api/v10/guilds/${discordGuildId}/channels`, {
          headers: { Authorization: `Bot ${botToken}` },
          cache: 'no-store',
        }),
      ])
      if (rolesRes.ok) {
        const raw = (await rolesRes.json()) as RawDiscordRole[]
        roles = raw
          .filter((r) => r.id !== discordGuildId && !r.managed)
          .map((r) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            position: r.position,
            hasAdminPerm: hasAdminPermissionBit(r.permissions),
          }))
          .sort((a, b) => b.position - a.position)
      }
      if (channelsRes.ok) {
        const raw = (await channelsRes.json()) as RawDiscordChannel[]
        channels = raw
          .filter((c) => c.type === 0 || c.type === 5)
          .map((c) => ({
            id: c.id,
            name: c.name,
            position: c.position,
            parent_id: c.parent_id,
          }))
          .sort((a, b) => a.position - b.position)
      }
    } catch (e) {
      console.error('[onboard/setup] failed to load Discord roles/channels', e)
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
        initialSlug={initialSlug}
        rootDomain={rootDomain}
        labels={{
          slugLabel: t('slugLabel'),
          slugHelp: t('slugHelp'),
          slugPreviewPrefix: t('slugPreviewPrefix'),
          slugDisplayNamePrefix: t('slugDisplayNamePrefix'),
          slugIssueEmpty: t('slugIssueEmpty'),
          slugIssueTooShort: t('slugIssueTooShort'),
          slugIssueTooLong: t('slugIssueTooLong'),
          slugIssueInvalidChars: t('slugIssueInvalidChars'),
          slugIssueHyphenEdge: t('slugIssueHyphenEdge'),
          slugIssueDoubleHyphen: t('slugIssueDoubleHyphen'),
          slugIssueReserved: t('slugIssueReserved'),
          memberRoleLabel: t('memberRoleLabel'),
          memberRoleHelp: t('memberRoleHelp'),
          adminRoleLabel: t('adminRoleLabel'),
          adminRoleHelp: t('adminRoleHelp'),
          adminRoleLockoutWarn: t('adminRoleLockoutWarn'),
          adminRoleAutoPreselectHint: t('adminRoleAutoPreselectHint'),
          channelLabel: t('channelLabel'),
          channelHelp: t('channelHelp'),
          noChannel: t('noChannel'),
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
