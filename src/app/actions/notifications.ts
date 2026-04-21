'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { requireEventCreator } from '@/lib/auth'

// 사용자(길드원/게스트) 본인의 Discord DM 수신 토글과 관리자용 Discord 역할
// 목록 조회를 담당. 웹 푸시 스택(actions/push.ts) 을 대체한다.

// 현재 세션 사용자의 discord_dm_enabled 값을 돌려준다. 기본값은 false (옵트인).
export async function getMyDmPreference(): Promise<{ enabled: boolean; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { enabled: false, error: tErr('loginRequired') }

  const db = getAdminClient()
  // 길드원(guild_avatars) 우선, 없으면 게스트(guests) 확인. 둘 다 없는 경우는
  // 실질적으로 세션이 살아있지만 아바타가 삭제된 엣지 케이스 — 기본 false 반환.
  const { data: avatar } = await db
    .from('guild_avatars')
    .select('discord_dm_enabled')
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (avatar) return { enabled: avatar.discord_dm_enabled ?? false }

  const { data: guest } = await db
    .from('guests')
    .select('discord_dm_enabled')
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (guest) return { enabled: guest.discord_dm_enabled ?? false }

  return { enabled: false }
}

export async function setMyDmPreference(
  enabled: boolean,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }

  const db = getAdminClient()
  // 세션의 역할 플래그로 어떤 테이블에 쓸지 결정. 길드원 ↔ 게스트 전환은
  // 로그인 시점에 갱신되므로 현재 세션 기준으로 분기하면 충분.
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { error } = await db
    .from(table)
    .update({ discord_dm_enabled: enabled })
    .eq('discord_id', session.discordId)
  if (error) return { error: error.message }

  revalidatePath('/me/settings')
  return {}
}

export interface DiscordRoleOption {
  id: string
  name: string
  color: number
  position: number
}

export interface DiscordChannelOption {
  id: string
  name: string
  position: number
  parent_id: string | null
}

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
  // type 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT. Others (voice/forum/etc.) 배제.
  type: number
  position: number
  parent_id: string | null
}

// 관리자 이벤트 편집 UI 에서 "어떤 역할을 태그할지" 고르는 드롭다운용.
// Discord API 로 길드 역할 전체를 한 번에 받아 UI 에 보낸다.
// @everyone 와 관리 역할(봇 자동 생성) 은 제외.
export async function listGuildRoles(): Promise<{
  roles: DiscordRoleOption[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireEventCreator()
    const botToken = process.env.DISCORD_BOT_TOKEN
    const guildId = process.env.DISCORD_GUILD_ID
    if (!botToken || !guildId) {
      return { roles: [], error: tErr('serverError') }
    }
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[notifications] listGuildRoles failed: ${res.status} ${text}`)
      return { roles: [], error: tErr('serverError') }
    }
    const raw = (await res.json()) as RawDiscordRole[]
    // @everyone 은 id === guildId 로 식별된다. Discord API 특성.
    // managed=true 는 봇/Integration 이 자동 생성한 역할 — 수동 멘션 대상 아님.
    const roles = raw
      .filter((r) => r.id !== guildId && !r.managed)
      .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }))
      .sort((a, b) => b.position - a.position)
    return { roles }
  } catch (e) {
    return { roles: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 이벤트 편집에서 "어떤 채널에 공지를 올릴지" 고르는 드롭다운용.
// 길드의 모든 채널을 받아 텍스트/공지 채널만 필터해 UI 에 돌려준다.
// category (type 4) 와 voice/forum 은 제외 — 메시지 전송 대상이 아니기 때문.
export async function listGuildChannels(): Promise<{
  channels: DiscordChannelOption[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    await requireEventCreator()
    const botToken = process.env.DISCORD_BOT_TOKEN
    const guildId = process.env.DISCORD_GUILD_ID
    if (!botToken || !guildId) {
      return { channels: [], error: tErr('serverError') }
    }
    const res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error(`[notifications] listGuildChannels failed: ${res.status} ${text}`)
      return { channels: [], error: tErr('serverError') }
    }
    const raw = (await res.json()) as RawDiscordChannel[]
    // GUILD_TEXT(0) 과 GUILD_ANNOUNCEMENT(5) 만 — 그 외 카테고리/보이스/포럼은
    // 봇 메시지 대상이 아니라서 UI 에 노출 안함.
    const channels = raw
      .filter((c) => c.type === 0 || c.type === 5)
      .map((c) => ({ id: c.id, name: c.name, position: c.position, parent_id: c.parent_id }))
      .sort((a, b) => a.position - b.position)
    return { channels }
  } catch (e) {
    return { channels: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
