import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
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

// /onboard/setup/[id] — 봇 설치 직후 이 tenant 의 멤버/관리자 역할과 알림 채널을
// 초기 설정한다. 이 페이지는 bot-callback 이 발급한 admin 세션(guildId=tenant
// id, isAdmin=true) 전제로 동작. 추가로 tenant.created_by_discord_id 가 요청자와
// 일치하는지 서버 쪽에서도 재검증한다 — 다른 admin 이 접근하는 걸 막기 위함.

interface Props {
  params: Promise<{ id: string }>
}

export default async function TenantSetupPage({ params }: Props) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/api/auth/discord/start?returnTo=/onboard')

  // 소유자 검증 + discord_guild_id 로드를 한 쿼리로 처리.
  // created_by_discord_id 가 요청자와 일치해야 설정 가능.
  const db = getAdminClient()
  const { data: tenantRow } = await db
    .from('tenants')
    .select('id, discord_guild_id, created_by_discord_id')
    .eq('id', id)
    .maybeSingle()
  if (!tenantRow || tenantRow.created_by_discord_id !== session.discordId) {
    redirect('/onboard')
  }
  const discordGuildId = tenantRow.discord_guild_id as string

  const t = await getTranslations('onboard')

  // Discord 역할/채널 프리로드. 실패하면 빈 배열로 대체하고 폼에서 안내.
  const botToken = process.env.DISCORD_BOT_TOKEN
  let roles: DiscordRoleOption[] = []
  let channels: DiscordChannelOption[] = []
  if (botToken) {
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
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
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
          saveButton: t('saveButton'),
          savingButton: t('savingButton'),
          errorGeneric: t('errorGeneric'),
          missingRoles: t('missingRoles'),
        }}
      />
    </main>
  )
}
