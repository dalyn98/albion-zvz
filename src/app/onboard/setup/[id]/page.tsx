import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import TenantSetupForm from '@/components/TenantSetupForm'

export const dynamic = 'force-dynamic'

interface RawDiscordRole {
  id: string
  name: string
  color: number
  position: number
  managed?: boolean
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
    .select('discord_guild_id')
    .eq('id', id)
    .maybeSingle()
  const discordGuildId = (tenantRow?.discord_guild_id ?? '') as string

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
          .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }))
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
        labels={{
          memberRoleLabel: t('memberRoleLabel'),
          memberRoleHelp: t('memberRoleHelp'),
          adminRoleLabel: t('adminRoleLabel'),
          adminRoleHelp: t('adminRoleHelp'),
          channelLabel: t('channelLabel'),
          channelHelp: t('channelHelp'),
          noChannel: t('noChannel'),
          nextButton: t('nextButton'),
          savingButton: t('savingButton'),
          errorGeneric: t('errorGeneric'),
          missingRoles: t('missingRoles'),
        }}
      />
    </>
  )
}
