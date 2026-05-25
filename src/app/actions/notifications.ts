'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getTenantTimezone } from '@/lib/timezone-server'
import { isValidTenantTimezone } from '@/lib/timezone'
import { log } from '@/lib/log'
import { CATEGORY_NOTIFY_COLUMN, EVENT_CATEGORIES, type EventCategory } from '@/types'
import { CAP } from '@/lib/permissions'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'

// 사용자(길드원/게스트) 본인의 Discord DM 수신 토글과 관리자용 Discord 역할
// 목록 조회를 담당. 웹 푸시 스택(actions/push.ts) 을 대체한다.

export interface DmPreference {
  enabled: boolean
  // 카테고리별 옵트아웃 (migration 063+064). EventCategory 별 key.
  categories: Record<EventCategory, boolean>
  // 개인 시간대 (NULL = 길드 기본 시간대 사용). 임박 DM 본문의 집결 시각이
  // 이 값으로 렌더링된다. 길드 가입자 중 EU/NA 거주자가 본인 지역 시간으로
  // 알람을 받을 수 있게 하는 핵심 필드.
  timezoneOverride: string | null
  // 길드 기본 시간대 — 개인이 NULL 일 때 적용. UI 안내용.
  guildDefaultTimezone: string
  error?: string
}

const DEFAULT_CATEGORIES: Record<EventCategory, boolean> = {
  '전투': true,
  'FF': true,
  '갱킹': true,
}

// 현재 세션 사용자의 DM 수신 설정을 한 번에 가져온다.
//   - enabled: discord_dm_enabled (마스터 스위치, 기본 false = 옵트인)
//   - categories: 카테고리별 옵트아웃 (기본 true = 기존 동작 유지)
//   - timezoneOverride: 개인 시간대 (NULL = 길드 기본 시간대)
//   - guildDefaultTimezone: 길드 기본 시간대 (UI 안내용)
// DB 의 DEFAULT 를 그대로 따른다.
export async function getMyDmPreference(): Promise<DmPreference> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) {
    return {
      enabled: false,
      categories: { ...DEFAULT_CATEGORIES },
      timezoneOverride: null,
      guildDefaultTimezone: 'Asia/Seoul',
      error: tErr('loginRequired'),
    }
  }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const columns =
    'discord_dm_enabled, notify_combat, notify_ff, notify_ganking, timezone'
  type Row = {
    discord_dm_enabled: boolean | null
    notify_combat: boolean | null
    notify_ff: boolean | null
    notify_ganking: boolean | null
    timezone: string | null
  }
  const guildDefaultTimezone = await getTenantTimezone(guildId)
  const toPref = (row: Row): DmPreference => ({
    enabled: row.discord_dm_enabled ?? false,
    categories: {
      '전투': row.notify_combat ?? true,
      'FF': row.notify_ff ?? true,
      '갱킹': row.notify_ganking ?? true,
    },
    timezoneOverride: row.timezone,
    guildDefaultTimezone,
  })

  // 길드원(guild_avatars) 우선, 없으면 게스트(guests) 확인. 둘 다 없는 경우는
  // 실질적으로 세션이 살아있지만 아바타가 삭제된 엣지 케이스 — 기본값 반환.
  const { data: avatar } = await db
    .from('guild_avatars')
    .select(columns)
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (avatar) return toPref(avatar as Row)

  const { data: guest } = await db
    .from('guests')
    .select(columns)
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (guest) return toPref(guest as Row)

  return {
    enabled: false,
    categories: { ...DEFAULT_CATEGORIES },
    timezoneOverride: null,
    guildDefaultTimezone,
  }
}

// 개인 시간대 override 저장. null 을 보내면 길드 기본 시간대를 따르도록 리셋.
// 알비온 4서버 프리셋 (Asia/Seoul, Europe/Berlin, America/New_York,
// America/Sao_Paulo) 만 허용 — 그 외 IANA 는 invalidInput 으로 거절.
export async function setMyTimezone(
  timezone: string | null,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  if (timezone !== null && !isValidTenantTimezone(timezone)) {
    return { error: tErr('invalidInput') }
  }

  const db = getAdminClient()
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { error } = await db
    .from(table)
    .update({ timezone })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (error) return { error: error.message }

  revalidatePath('/me/settings')
  return {}
}

export async function setMyDmPreference(
  enabled: boolean,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  // 세션의 역할 플래그로 어떤 테이블에 쓸지 결정. 길드원 ↔ 게스트 전환은
  // 로그인 시점에 갱신되므로 현재 세션 기준으로 분기하면 충분.
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { error } = await db
    .from(table)
    .update({ discord_dm_enabled: enabled })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (error) return { error: error.message }

  revalidatePath('/me/settings')
  return {}
}

// 카테고리별 알림 옵트아웃 토글. discord_dm_enabled 가 꺼져 있으면 이 값은
// 아무 효과 없음 (filterDmOptedIn 에서 enabled 가 먼저 걸러짐).
export async function setMyCategoryPreference(
  category: EventCategory,
  enabled: boolean,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  // 클라이언트가 보낸 category 가 타입 시스템을 벗어난 값일 수 있어 — 화이트
  // 리스트 검증. 통과 실패 시 컬럼 매핑이 undefined 로 빠져 Supabase 에 잘못된
  // SQL 이 전달되는 걸 막는다.
  if (!EVENT_CATEGORIES.includes(category)) {
    return { error: tErr('invalidInput') }
  }

  const column = CATEGORY_NOTIFY_COLUMN[category]
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const db = getAdminClient()
  const { error } = await db
    .from(table)
    .update({ [column]: enabled })
    .eq('guild_id', guildId)
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
    const session = await getSession()
    if (!session) return { roles: [], error: tErr('serverError') }
    if (
      !session.isAdmin &&
      !sessionCanCreateOrManageEvents(session) &&
      !sessionHasAny(session, [
        CAP.SETTINGS_PERMISSIONS,
        CAP.SETTINGS_GENERAL,
        CAP.SETTINGS_TOGGLES,
      ])
    ) {
      throw new Error('Unauthorized')
    }
    const sessionGuildId = await getSessionGuildId(session)
    const tenantConfig = await getTenantDiscordConfig(sessionGuildId)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken || !tenantConfig) {
      return { roles: [], error: tErr('serverError') }
    }
    const discordGuildId = tenantConfig.discordGuildId
    const res = await fetch(`https://discord.com/api/v10/guilds/${discordGuildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      log.error('[notifications] listGuildRoles failed', undefined, {
        tenant_id: sessionGuildId,
        discord_guild_id: discordGuildId,
        status: res.status,
        response: text,
      })
      return { roles: [], error: tErr('serverError') }
    }
    const raw = (await res.json()) as RawDiscordRole[]
    // @everyone 은 id === guildId 로 식별된다. Discord API 특성.
    // managed=true 는 봇/Integration 이 자동 생성한 역할 — 수동 멘션 대상 아님.
    const roles = raw
      .filter((r) => r.id !== discordGuildId && !r.managed)
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
    const session = await getSession()
    if (!session) return { channels: [], error: tErr('serverError') }
    if (
      !session.isAdmin &&
      !sessionCanCreateOrManageEvents(session) &&
      !sessionHasAny(session, [CAP.SETTINGS_GENERAL])
    ) {
      throw new Error('Unauthorized')
    }
    const sessionGuildId = await getSessionGuildId(session)
    const tenantConfig = await getTenantDiscordConfig(sessionGuildId)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken || !tenantConfig) {
      return { channels: [], error: tErr('serverError') }
    }
    const res = await fetch(`https://discord.com/api/v10/guilds/${tenantConfig.discordGuildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      log.error('[notifications] listGuildChannels failed', undefined, {
        tenant_id: sessionGuildId,
        discord_guild_id: tenantConfig.discordGuildId,
        status: res.status,
        response: text,
      })
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
