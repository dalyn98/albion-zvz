'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { requireEventCreator } from '@/lib/auth'
import { CATEGORY_NOTIFY_COLUMN, EVENT_CATEGORIES, type EventCategory } from '@/types'

// 길드 기본값. 개인이 NULL 로 두면 이 값을 따른다.
const DEFAULT_DM_LEAD_MINUTES = 35
// 개인 override 허용 최소/최대 — 너무 짧으면 cron 5분 주기를 못 맞추고,
// 너무 길면 데이터 의미가 흐려진다.
const DM_LEAD_MIN_MINUTES = 5
const DM_LEAD_MAX_MINUTES = 1440

// 'use server' 파일은 async 함수만 export 가능 — 헬퍼/상수는 모듈 내부 전용.
function clampLeadMinutes(value: number, fallback: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) return fallback
  if (value < DM_LEAD_MIN_MINUTES || value > DM_LEAD_MAX_MINUTES) return fallback
  return value
}

// 사용자(길드원/게스트) 본인의 Discord DM 수신 토글과 관리자용 Discord 역할
// 목록 조회를 담당. 웹 푸시 스택(actions/push.ts) 을 대체한다.

export interface DmPreference {
  enabled: boolean
  // 카테고리별 옵트아웃 (migration 063+064). EventCategory 별 key.
  categories: Record<EventCategory, boolean>
  // 개인 lead 분(NULL = 길드 기본값 사용). UI 에서 "기본값 사용" 옵션과 함께 노출.
  leadMinutesOverride: number | null
  // 길드 기본 lead 분 — 개인이 NULL 일 때 적용되는 값. UI 에 안내용으로 노출.
  guildDefaultLeadMinutes: number
  error?: string
}

const DEFAULT_CATEGORIES: Record<EventCategory, boolean> = {
  '전투': true,
  'FF': true,
  '갱킹': true,
}

// 길드 기본 lead 분을 app_settings 에서 읽는다. 잘못된 값/없을 때는 35로 degrade.
async function getGuildDefaultLeadMinutes(guildId: string): Promise<number> {
  const raw = await getAppSetting('event_dm_lead_minutes', String(DEFAULT_DM_LEAD_MINUTES), guildId)
  return clampLeadMinutes(Number(raw), DEFAULT_DM_LEAD_MINUTES)
}

// 현재 세션 사용자의 DM 수신 설정을 한 번에 가져온다.
//   - enabled: discord_dm_enabled (마스터 스위치, 기본 false = 옵트인)
//   - categories: 카테고리별 옵트아웃 (기본 true = 기존 동작 유지)
//   - leadMinutesOverride: 개인 lead 분 override (NULL = 길드 기본값)
//   - guildDefaultLeadMinutes: 길드 기본 lead 분 (UI 안내용)
// DB 의 DEFAULT 를 그대로 따른다.
export async function getMyDmPreference(): Promise<DmPreference> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) {
    return {
      enabled: false,
      categories: { ...DEFAULT_CATEGORIES },
      leadMinutesOverride: null,
      guildDefaultLeadMinutes: DEFAULT_DM_LEAD_MINUTES,
      error: tErr('loginRequired'),
    }
  }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const columns = 'discord_dm_enabled, notify_combat, notify_ff, notify_ganking, dm_lead_minutes'
  type Row = {
    discord_dm_enabled: boolean | null
    notify_combat: boolean | null
    notify_ff: boolean | null
    notify_ganking: boolean | null
    dm_lead_minutes: number | null
  }
  const guildDefault = await getGuildDefaultLeadMinutes(guildId)
  const toPref = (row: Row): DmPreference => ({
    enabled: row.discord_dm_enabled ?? false,
    categories: {
      '전투': row.notify_combat ?? true,
      'FF': row.notify_ff ?? true,
      '갱킹': row.notify_ganking ?? true,
    },
    leadMinutesOverride: row.dm_lead_minutes,
    guildDefaultLeadMinutes: guildDefault,
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
    leadMinutesOverride: null,
    guildDefaultLeadMinutes: guildDefault,
  }
}

// 개인 lead 분 override 저장. null 을 보내면 길드 기본값을 사용하도록 리셋.
export async function setMyDmLeadMinutes(
  override: number | null,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  if (override !== null) {
    if (!Number.isInteger(override) || override < DM_LEAD_MIN_MINUTES || override > DM_LEAD_MAX_MINUTES) {
      return { error: tErr('invalidInput') }
    }
  }

  const db = getAdminClient()
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { error } = await db
    .from(table)
    .update({ dm_lead_minutes: override })
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
    await requireEventCreator()
    const session = await getSession()
    if (!session) return { roles: [], error: tErr('serverError') }
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
      console.error(`[notifications] listGuildRoles failed: ${res.status} ${text}`)
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
    await requireEventCreator()
    const session = await getSession()
    if (!session) return { channels: [], error: tErr('serverError') }
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
