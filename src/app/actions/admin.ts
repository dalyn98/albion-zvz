'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import {
  requireEventCreator,
  requireEventCreatorForEvent,
  requireEventCreatorForSlot,
  requireEventCreatorOrPartyCaller,
} from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { sendEventNotification, DiscordChannelMessageError } from '@/lib/discord'
import { getAppSetting } from '@/lib/app-settings'
import { getLocale } from '@/lib/locale'
import { getTenantTimezone } from '@/lib/timezone-server'
import type { Locale } from '@/i18n/locales'
import type { BombSquadKind, EventCategory, SlotKey, SlotSpells, GearOption, GearSpec, GearSpecs } from '@/types'
import {
  BOMB_SQUAD_KINDS,
  CATEGORY_PARTY_LIMITS,
  EVENT_CATEGORIES,
  SLOT_KEYS,
  GEAR_TIER_MIN,
  GEAR_TIER_MAX,
  GEAR_ENCHANT_MIN,
  GEAR_ENCHANT_MAX,
  isTierlessSlot,
  isSpecLessSlot,
} from '@/types'

// next-intl locale 코드(ko/ja/en) → Intl.DateTimeFormat 이 받는 BCP 47 태그.
// Discord embed 의 일시 표기 포맷에 사용 — 시간대는 길드 설정(getTenantTimezone)
// 으로 결정.
const LOCALE_TO_BCP47: Record<Locale, string> = {
  ko: 'ko-KR',
  ja: 'ja-JP',
  en: 'en-US',
}

// 카테고리와 무관하게 존재할 수 있는 가장 큰 파티 번호 — 입력이 터무니없이
// 크면 아래 category-aware 검증 이전에 빠르게 차단.
const HARD_MAX_PARTIES = Math.max(...Object.values(CATEGORY_PARTY_LIMITS).map((l) => l.max))
const MAX_SLOTS_PER_PARTY = 20

type AdminErrorTranslator = Awaited<ReturnType<typeof getTranslations<'adminActionError'>>>

// --- Event actions ---

interface EventPayload {
  title: string
  gather_at: string
  gather_time: string
  gather_location: string
  special_notes: string | null
  // 이벤트 생성/편집 시 관리자가 고른 Discord 역할 ID. notifyEvent 가
  // 채널 공지 시 이 역할만 @멘션한다. NULL/미지정이면 멘션 없이 조용히 공지.
  // optional 로 둬서 role picker UI 를 아직 안 쓰는 호출부도 호환되게 한다.
  notify_role_id?: string | null
  // 편집 화면에서 관리자가 고른 Discord 채널 ID. NULL 이면 env 기반 기본
  // 채널(DISCORD_EVENT_CHANNEL_ID) 로 fallback. 생성 폼은 이 필드를 보내지
  // 않으며 편집 단계에서만 채널을 고른다.
  notify_channel_id?: string | null
  // Migration 105: 채널 공지에 @everyone 을 함께 붙일지 여부. 편집 화면에서만
  // 토글하며, 생성 폼은 이 필드를 보내지 않는다 (DB DEFAULT false 적용).
  notify_everyone?: boolean
  // Migration 063: 이벤트 카테고리. 생성 시 선택하고 편집에서도 변경 가능.
  // 생략하면 DB 기본값 '전투' 가 적용된다.
  category?: EventCategory
}

// Final check in case the client bypassed validation — a bad ISO string would
// otherwise surface as an obscure Postgres error on insert.
// publishing=true 면 발행 시점 검증 — gather_at 은 필수, gather_location 은 옵션
// (사전에 장소를 못 정하는 이벤트도 있어 발행을 막지 않는다).
// publishing=false 면 draft 편집 중이라 gather_at 은 비어 있어도 OK.
function validateEventPayload(
  payload: EventPayload,
  tErr: AdminErrorTranslator,
  opts: { publishing: boolean } = { publishing: true },
): string | null {
  if (!payload.title.trim()) return tErr('missingTitle')
  if (opts.publishing) {
    const dt = new Date(payload.gather_at)
    if (Number.isNaN(dt.getTime())) return tErr('invalidGatherTime')
  } else if (payload.gather_at) {
    // draft 단계라도 값이 들어왔으면 형식은 맞아야 한다 — 완전 공란만 허용.
    const dt = new Date(payload.gather_at)
    if (Number.isNaN(dt.getTime())) return tErr('invalidGatherTime')
  }
  // 카테고리 — 값이 있으면 화이트리스트 검증. 없으면 DB DEFAULT ('전투') 사용.
  if (payload.category !== undefined && !EVENT_CATEGORIES.includes(payload.category)) {
    return tErr('serverError')
  }
  return null
}

// 이벤트를 draft 상태로 생성. 제목만 받아 빈 껍질을 만든 뒤 편집/발행 단계로 넘긴다.
// 기존 createEvent 와 달리 gather_at 을 요구하지 않으며 공개 /events 에도 뜨지 않는다.
export async function createDraftEvent(
  payload: { title: string; category?: EventCategory },
): Promise<{ id: string } | { error: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!payload.title.trim()) return { error: tErr('missingTitle') }
    const category: EventCategory =
      payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
    const session = await getSession()
    if (!session?.canCreateEvents) return { error: tErr('unauthorized') }
    if (!session.isAdmin && !session.eventCreatorCategories.includes(category)) {
      return { error: tErr('unauthorized') }
    }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('events')
      .insert({
        guild_id: guildId,
        title: payload.title.trim(),
        gather_time: '',
        gather_at: null,
        gather_location: '',
        special_notes: null,
        status: 'draft',
        category,
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    return { id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 기존 코드 호환을 위해 `createEvent` 는 남겨두되, 내부적으로는 draft 를 만든 뒤
// 즉시 update 로 메타를 채운다. EventInfoForm create 모드의 기존 흐름에서 호출되며
// 이 경우에도 status 는 'draft' 로 두고 공개는 publishEvent 까지 미룬다.
export async function createEvent(payload: EventPayload): Promise<{ id: string } | { error: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const invalid = validateEventPayload(payload, tErr, { publishing: false })
    if (invalid) return { error: invalid }
    const session = await getSession()
    if (!session?.canCreateEvents) return { error: tErr('unauthorized') }
    const requestedCategory: EventCategory =
      payload.category && EVENT_CATEGORIES.includes(payload.category) ? payload.category : '전투'
    if (!session.isAdmin && !session.eventCreatorCategories.includes(requestedCategory)) {
      return { error: tErr('unauthorized') }
    }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db
      .from('events')
      .insert({ ...payload, guild_id: guildId, status: 'draft', created_by: session.discordId })
      .select('id')
      .single()
    if (error) return { error: error.message }
    return { id: data.id }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateEvent(id: string, payload: EventPayload): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    // draft 편집 중에도 부분 저장을 허용해야 하므로 publishing=false. 발행 단계
    // 에서 한 번 더 strict 검증을 거친다.
    const invalid = validateEventPayload(payload, tErr, { publishing: false })
    if (invalid) return { error: invalid }
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)

    // gather_at 가 바뀌면 자동 시작/임박 DM 의 "이미 처리됨" 표식을 함께 지운다.
    // 그렇지 않으면 admin 이 시간을 늦춰도 cron 은 옛 발화 기록을 보고 재발동을
    // 건너뛰어 — DM 이 안 가고 battle_started_at 이 옛 시간으로 굳어진다.
    const { data: current } = await db
      .from('events')
      .select('gather_at')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    const previousGatherAt = (current?.gather_at ?? null) as string | null
    const gatherAtChanged = previousGatherAt !== payload.gather_at
    const finalPayload: Record<string, unknown> = { ...payload }
    if (gatherAtChanged) {
      finalPayload.battle_started_at = null
      // legacy 컬럼이지만 운영 데이터가 남아 있어 같이 비워준다 (기존 cron 잔재).
      finalPayload.imminent_notified_at = null
    }

    const { error } = await db.from('events').update(finalPayload).eq('guild_id', guildId).eq('id', id)
    if (error) return { error: error.message }
    // gather_at 이 바뀌면 (event, member) 단위 DM 발송 기록도 비워 — 새 시간 기준
    // 으로 다시 발송될 수 있도록. event_dm_sent 가 비어있어도 cron 이 정상 동작
    // 하므로 실패는 무시.
    if (gatherAtChanged) {
      const { error: clearError } = await db
        .from('event_dm_sent')
        .delete()
        .eq('event_id', id)
      if (clearError) {
        console.error('[admin/updateEvent] event_dm_sent clear failed:', clearError.message)
      }
    }
    revalidatePath('/admin/dashboard')
    // 편집 페이지 자체도 invalidate — 그렇지 않으면 router.refresh() 후에도
    // PublishEventBanner 가 stale event prop 으로 렌더되어 발행 버튼이 비활성
    // 상태 그대로 남는다.
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// draft → published 전이. 호출자(PublishEventBanner)가 먼저 저장 컨텍스트를
// 통해 모든 폼 섹션을 DB 에 commit 한 뒤 호출하므로, 여기서는 DB 의 현재 값을
// 읽어 필수 필드(title / gather_at / gather_location)를 검증하고 status 만 전이.
// 이렇게 두면 stale form payload 가 저장된 값을 덮어쓰는 race 를 원천 차단.
// 발행 직후에는 길드의 Discord 알림 채널이 설정되어 있으면 자동으로 알림을
// 발송한다 — 마케팅 카피와 사용자 멘탈 모델("발행=공지") 에 맞추기 위함. 알림이
// 실패해도 발행 자체는 성공시키고, 실패 사유는 warning 으로 회신해 UI 에서
// 표시할 수 있게 한다.
export async function publishEvent(id: string): Promise<{ error?: string; warning?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    const { data: current, error: fetchError } = await db
      .from('events')
      .select('title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id, category')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (fetchError) return { error: fetchError.message }
    if (!current) return { error: tErr('eventNotFound') }
    const invalid = validateEventPayload(current as EventPayload, tErr, { publishing: true })
    if (invalid) return { error: invalid }
    const { error } = await db
      .from('events')
      .update({ status: 'published' })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)

    // 자동 알림 — 채널이 해석되지 않으면 조용히 skip (Discord 미연동 길드는
    // 발행만 정상 동작). 실패는 warning 으로 surface 해서 관리자가 종 버튼으로
    // 수동 재시도 할 수 있게 한다.
    const tenantConfig = await getTenantDiscordConfig(guildId)
    const channelId = current.notify_channel_id ?? tenantConfig?.eventChannelId ?? null
    if (channelId) {
      const dispatch = await dispatchEventNotification(db, guildId, id, tenantConfig)
      if (dispatch.error) return { warning: dispatch.error }
    }
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function notifyEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    return await dispatchEventNotification(db, guildId, id)
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 이벤트 알림을 빌드해서 Discord 로 발송한다. publishEvent (자동) /
// notifyEvent (수동) 가 공통으로 사용. 채널 ID 가 null 이면 sendEventNotification
// 이 throw 하므로, 자동 발송 경로는 호출 전에 channelId 를 직접 확인하고 skip
// 할 책임이 있다. 수동 발송은 throw 를 그대로 사용자에게 보여줘 채널 설정
// 누락을 인지하게 한다.
type EventCreatorDb = Awaited<ReturnType<typeof requireEventCreatorForEvent>>
type CachedTenantConfig = Awaited<ReturnType<typeof getTenantDiscordConfig>>

async function dispatchEventNotification(
  db: EventCreatorDb,
  guildId: string,
  eventId: string,
  cachedTenantConfig?: CachedTenantConfig,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { data, error } = await db
      .from('events')
      .select('id, title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id, notify_everyone')
      .eq('guild_id', guildId)
      .eq('id', eventId)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: tErr('eventNotFound') }
    // 관리자가 설정 화면에서 알림 문구를 저장하지 않은 경우 호출자(관리자)
    // 의 locale 에 맞는 기본 문구를 사용. 길드별 단일 언어 설정은 없지만,
    // 알림을 트리거하는 사람의 locale 이 길드 운영 언어일 가능성이 가장 높다.
    const tEvent = await getTranslations('event')
    const savedMessage = await getAppSetting('event_notification_message', '', guildId)
    const content = savedMessage.trim().length > 0
      ? savedMessage
      : tEvent('defaultNotificationMessage')
    // notify_channel_id 가 null 이면 tenant 기본 채널로 fallback. tenant 도
    // 안 설정되어 있으면 sendEventNotification 에서 throw — 수동 발송 경로는
    // 이 throw 로 채널 설정 누락을 사용자에게 즉시 알린다.
    const tenantConfig = cachedTenantConfig ?? await getTenantDiscordConfig(guildId)
    const channelId = data.notify_channel_id ?? tenantConfig?.eventChannelId ?? null
    // Discord embed 라벨/날짜 포맷은 알림 트리거 관리자의 locale 로 — 길드별
    // 단일 운영 언어 컨벤션을 가정한다 (channel 은 1 곳, 라벨은 1 종류).
    const adminLocale = await getLocale()
    const dateLocale = LOCALE_TO_BCP47[adminLocale]
    const tenantTimezone = await getTenantTimezone(guildId)
    await sendEventNotification(data, {
      content,
      notifyRoleId: data.notify_role_id,
      notifyEveryone: data.notify_everyone === true,
      channelId,
      fieldLabels: {
        gatherAt: tEvent('discordFieldGatherAt'),
        gatherTime: tEvent('discordFieldGatherTime'),
        gatherLocation: tEvent('discordFieldGatherLocation'),
        specialNotes: tEvent('discordFieldSpecialNotes'),
      },
      dateLocale,
      tenantTimezone,
      tenantSlug: tenantConfig?.slug ?? null,
    })
    return {}
  } catch (e) {
    if (e instanceof DiscordChannelMessageError) {
      // 디스코드 에러 코드 참고: https://discord.com/developers/docs/topics/opcodes-and-status-codes
      // 50001 Missing Access — 봇이 채널을 못 봄 (다른 길드 채널이거나 권한 차단)
      // 50013 Missing Permissions — 채널은 보이지만 메시지 보낼 권한 없음
      // 10003 Unknown Channel — 채널 ID 자체가 무효 (삭제됨/오타)
      // 50007 Cannot send messages to this user — DM 차단 (DM 헬퍼 쪽)
      // 그 외 코드/상태는 generic 메시지 + raw 본문 노출.
      const tNotify = await getTranslations('adminNotifyError')
      if (e.discordCode === 50001) return { error: tNotify('missingAccess') }
      if (e.discordCode === 50013) return { error: tNotify('missingPermissions') }
      if (e.discordCode === 10003) return { error: tNotify('unknownChannel') }
      if (e.status === 401 || e.status === 403) {
        return { error: tNotify('forbidden', { status: e.status }) }
      }
      return {
        error: tNotify('generic', {
          status: e.status,
          message: e.discordMessage ?? e.raw.slice(0, 200),
        }),
      }
    }
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function cloneEvent(id: string): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDash = await getTranslations('adminDashboard')
  try {
    const session = await getSession()
    if (!session?.canCreateEvents) return { error: tErr('unauthorized') }
    const db = await requireEventCreator()
    const guildId = await getSessionGuildId(session)

    const { data: source, error: sourceErr } = await db
      .from('events')
      .select('title, gather_at, gather_time, gather_location, special_notes, notify_role_id, notify_channel_id, notify_everyone')
      .eq('guild_id', guildId)
      .eq('id', id)
      .maybeSingle()
    if (sourceErr) return { error: sourceErr.message }
    if (!source) return { error: tErr('eventNotFound') }

    // Shift gather_at forward by 7 days so the copy lands on the same weekday
    // at the same hour. Admin can still edit if needed.
    let shiftedGatherAt = source.gather_at as string | null
    if (shiftedGatherAt) {
      const d = new Date(shiftedGatherAt)
      d.setUTCDate(d.getUTCDate() + 7)
      shiftedGatherAt = d.toISOString()
    }

    const { data: newEvent, error: insErr } = await db
      .from('events')
      .insert({
        guild_id: guildId,
        title: `${source.title}${tDash('duplicateSuffix')}`,
        gather_time: source.gather_time,
        gather_at: shiftedGatherAt,
        gather_location: source.gather_location,
        special_notes: source.special_notes,
        notify_role_id: source.notify_role_id,
        notify_channel_id: source.notify_channel_id,
        notify_everyone: source.notify_everyone,
        // 복제는 늘 draft 로 시작 — 관리자가 날짜/공지 확인 후 명시적으로 발행.
        status: 'draft',
        created_by: session.discordId,
      })
      .select('id')
      .single()
    if (insErr) return { error: insErr.message }
    const newId = newEvent.id

    const { data: parties, error: partyErr } = await db
      .from('parties')
      .select('id, party_number')
      .eq('guild_id', guildId)
      .eq('event_id', id)
      .order('party_number')
    if (partyErr) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: partyErr.message }
    }

    if (!parties || parties.length === 0) {
      revalidatePath('/admin/dashboard')
      return { id: newId }
    }

    const newPartyRows = parties.map((p) => ({
      guild_id: guildId,
      event_id: newId,
      party_number: p.party_number,
    }))
    const { data: newParties, error: newPartyErr } = await db
      .from('parties')
      .insert(newPartyRows)
      .select('id, party_number')
    if (newPartyErr || !newParties) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: newPartyErr?.message ?? tErr('serverError') }
    }

    const oldToNewPartyId = new Map<string, string>()
    for (const oldParty of parties) {
      const match = newParties.find((np) => np.party_number === oldParty.party_number)
      if (match) oldToNewPartyId.set(oldParty.id, match.id)
    }

    // Copy build config only — strip id/assigned_* so the clone starts with
    // empty signup slots. Callers usually duplicate a proven event to re-run it.
    const { data: slots, error: slotErr } = await db
      .from('slots')
      .select('*')
      .eq('guild_id', guildId)
      .in('party_id', parties.map((p) => p.id))
    if (slotErr) {
      await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
      return { error: slotErr.message }
    }

    if (slots && slots.length > 0) {
      const newSlotRows = slots.map((slot) => {
        const row: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(slot)) {
          if (key === 'id') continue
          if (key.startsWith('assigned_')) continue
          if (key === 'party_id') continue
          row[key] = value
        }
        row.party_id = oldToNewPartyId.get(slot.party_id)
        row.guild_id = guildId
        return row
      })
      const { error: insSlotErr } = await db.from('slots').insert(newSlotRows)
      if (insSlotErr) {
        await db.from('events').delete().eq('guild_id', guildId).eq('id', newId)
        return { error: insSlotErr.message }
      }
    }

    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    return { id: newId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteEvent(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    // regear_requests keeps history via SET NULL (migration 005).
    const { error } = await db.from('events').delete().eq('guild_id', guildId).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard')
    revalidatePath('/')
    revalidatePath(`/events/${id}`)
    revalidatePath('/me')
    revalidatePath('/members')
    revalidatePath('/members/[discordId]', 'page')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function startBattle(id: string): Promise<{ startedAt?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    const startedAt = new Date().toISOString()
    const { error } = await db
      .from('events')
      .update({ battle_started_at: startedAt })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    return { startedAt }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function resetBattleStart(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForEvent(id)
    const guildId = await getSessionGuildId(session)
    // 전투 초기화 후엔 임박 DM 도 재발송 가능 상태로 되돌리는 게 직관적.
    // gather_at 자체는 그대로 두므로 cron 은 기존 시간에 다시 발동.
    // imminent_notified_at 은 legacy 컬럼이지만 운영 데이터 남아 있어 같이 비움.
    const { error } = await db
      .from('events')
      .update({ battle_started_at: null, imminent_notified_at: null })
      .eq('guild_id', guildId)
      .eq('id', id)
    if (error) return { error: error.message }
    // 새 dedupe 인 event_dm_sent 도 비워야 cron 이 같은 멤버에게 다시 시도한다.
    const { error: clearError } = await db
      .from('event_dm_sent')
      .delete()
      .eq('event_id', id)
    if (clearError) {
      console.error('[admin/resetBattleStart] event_dm_sent clear failed:', clearError.message)
    }
    revalidatePath(`/admin/dashboard/events/${id}`)
    revalidatePath(`/events/${id}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// --- Party / slot actions ---

interface SlotPayload {
  id?: string
  slot_number: number
  is_hidden: boolean
  role_name: string
  notes: string
  items: Record<SlotKey, { name: string; id: string }>
  options: Record<SlotKey, GearOption[]>
  spells: SlotSpells
  specs?: Partial<Record<SlotKey, GearSpec>>
  // Migration 050: per-slot auto-regear opt-out. Optional for compatibility
  // with template-shaped callers that don't know about this flag yet.
  auto_regear_excluded?: boolean
  // Migration 069: per-slot manual regear opt-out.
  manual_regear_excluded?: boolean
  // Migration 134: 솔로밤 슬롯. 파티가 밤스쿼드일 때만 의미 있음 (DB 트리거가
  // 검증). 솔로밤이면 슬롯 옵션은 비어 있을 수 있고 멤버가 free-form 으로
  // 빌드를 채워 신청한다.
  is_solo_bomb?: boolean
}

// Migration 041: party-level bomb-squad metadata. All fields optional on input
// so older callers (templates, tests) can omit. sanitizePartyMeta enforces the
// "kind required when flag is on, name/caller only when flag is on" rules.
export interface PartyMetaPayload {
  is_bomb_squad?: boolean
  bomb_squad_kind?: BombSquadKind | null
  name?: string | null
  caller_discord_id?: string | null
}

const MAX_PARTY_NAME_LENGTH = 40

function sanitizePartyMeta(
  meta: PartyMetaPayload | undefined,
  tErr: AdminErrorTranslator,
): { row: {
  name: string | null
  is_bomb_squad: boolean
  bomb_squad_kind: BombSquadKind | null
  caller_discord_id: string | null
} } | { error: string } {
  const isBomb = meta?.is_bomb_squad === true
  if (!isBomb) {
    return {
      row: {
        name: null,
        is_bomb_squad: false,
        bomb_squad_kind: null,
        caller_discord_id: null,
      },
    }
  }
  const kind = meta?.bomb_squad_kind
  if (!kind || !BOMB_SQUAD_KINDS.includes(kind)) {
    return { error: tErr('bombSquadKindRequired') }
  }
  const rawName = typeof meta?.name === 'string' ? meta.name.trim() : ''
  if (rawName.length > MAX_PARTY_NAME_LENGTH) {
    return { error: tErr('partyNameTooLong', { max: MAX_PARTY_NAME_LENGTH }) }
  }
  const rawCaller = typeof meta?.caller_discord_id === 'string' ? meta.caller_discord_id.trim() : ''
  return {
    row: {
      name: rawName || null,
      is_bomb_squad: true,
      bomb_squad_kind: kind,
      caller_discord_id: rawCaller || null,
    },
  }
}

function sanitizeOptionSpells(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const v of raw) {
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out.length > 0 ? out : undefined
}

function sanitizeGearOptions(opts: GearOption[]): GearOption[] | null {
  const clean = opts
    .filter((o) => o && typeof o.id === 'string' && typeof o.name === 'string' && o.id && o.name)
    .map((o) => {
      const spells = sanitizeOptionSpells(o.spells)
      // spells 가 비어있으면 필드 자체를 빼서 jsonb 용량을 아낀다. 누락은
      // undefined/[] 동등 취급 (viewer 가 `opt.spells ?? []` 로 읽는다).
      return spells ? { name: o.name, id: o.id, spells } : { name: o.name, id: o.id }
    })
  // Dedupe by id, preserving order.
  const seen = new Set<string>()
  const deduped = clean.filter((o) => (seen.has(o.id) ? false : (seen.add(o.id), true)))
  return deduped.length > 0 ? deduped : null
}

// Drops non-string entries, dedupes within each kind, and strips empty
// buckets so the stored JSONB stays minimal. Returns null when no bucket
// has any spells — NULL in the column conveys "not configured".
function sanitizeSpells(spells: SlotSpells | null | undefined): SlotSpells | null {
  if (!spells || typeof spells !== 'object') return null
  const out: SlotSpells = {}
  for (const key of SLOT_KEYS) {
    const raw = spells[key]
    if (!Array.isArray(raw)) continue
    const seen = new Set<string>()
    const cleaned: string[] = []
    for (const v of raw) {
      if (typeof v !== 'string') continue
      const trimmed = v.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      cleaned.push(trimmed)
    }
    if (cleaned.length > 0) out[key] = cleaned
  }
  return Object.keys(out).length > 0 ? out : null
}

// Drops undefined/out-of-range entries so the stored jsonb stays minimal and
// well-formed. Returns null when no slot has any spec configured.
function sanitizeGearSpecs(specs: Partial<Record<SlotKey, GearSpec>> | null | undefined): GearSpecs | null {
  if (!specs || typeof specs !== 'object') return null
  const out: GearSpecs = {}
  for (const key of SLOT_KEYS) {
    if (isSpecLessSlot(key)) continue
    const raw = specs[key]
    if (!raw || typeof raw !== 'object') continue
    const clean: GearSpec = {}
    if (
      !isTierlessSlot(key) &&
      typeof raw.tier === 'number' &&
      raw.tier >= GEAR_TIER_MIN &&
      raw.tier <= GEAR_TIER_MAX
    ) {
      clean.tier = raw.tier
    }
    if (
      typeof raw.enchant === 'number' &&
      raw.enchant >= GEAR_ENCHANT_MIN &&
      raw.enchant <= GEAR_ENCHANT_MAX
    ) {
      clean.enchant = raw.enchant
    }
    if (clean.tier != null || clean.enchant != null) out[key] = clean
  }
  return Object.keys(out).length > 0 ? out : null
}

function slotToRow(partyId: string, slot: SlotPayload, guildId?: string) {
  const cleanedOptions = SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: sanitizeGearOptions(slot.options[k] ?? []) }),
    {} as Record<SlotKey, GearOption[] | null>,
  )
  // When a slot kind has multi-options, the fixed {kind}_name/id columns must
  // be cleared — the member's pick lands in assigned_{kind}_* at assign time.
  // Holding both a fixed item and an option list would let stale fixed data
  // survive a mode switch.
  // guildId 는 INSERT 경로에서만 넘긴다. UPDATE 는 기존 행의 guild_id 를
  // 건드리지 않는다.
  return {
    ...(guildId !== undefined ? { guild_id: guildId } : {}),
    party_id: partyId,
    slot_number: slot.slot_number,
    is_hidden: slot.is_hidden,
    role_name: slot.role_name.trim() || null,
    notes: slot.notes.trim() || null,
    spells: sanitizeSpells(slot.spells),
    gear_specs: sanitizeGearSpecs(slot.specs),
    auto_regear_excluded: slot.auto_regear_excluded === true,
    manual_regear_excluded: slot.manual_regear_excluded === true,
    is_solo_bomb: slot.is_solo_bomb === true,
    ...SLOT_KEYS.reduce((acc, k) => {
      const hasOptions = cleanedOptions[k] !== null
      return {
        ...acc,
        [`${k}_options`]: cleanedOptions[k],
        [`${k}_name`]: hasOptions ? null : slot.items[k].name || null,
        [`${k}_id`]: hasOptions ? null : slot.items[k].id || null,
      }
    }, {}),
  }
}

export async function savePartySlots(
  eventId: string,
  partyNumber: number,
  partyId: string | null,
  slots: SlotPayload[],
  originalSlotIds: string[],
  partyMeta?: PartyMetaPayload,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (partyNumber < 1 || partyNumber > HARD_MAX_PARTIES) return { error: tErr('invalidPartyNumber') }
    if (slots.length > MAX_SLOTS_PER_PARTY) return { error: tErr('tooManySlots', { max: MAX_SLOTS_PER_PARTY }) }

    const metaResult = sanitizePartyMeta(partyMeta, tErr)
    if ('error' in metaResult) return { error: metaResult.error }
    const metaRow = metaResult.row

    const { db, isAdminOrOwner } = await requireEventCreatorOrPartyCaller(eventId, partyId)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    // Validate event exists + category-aware party cap. FF/갱킹 이벤트에서 UI
    // 를 우회해 5번째 파티를 저장하려는 요청을 서버에서도 거부.
    const { data: eventRow, error: eventCheckError } = await db
      .from('events')
      .select('id, category')
      .eq('guild_id', guildId)
      .eq('id', eventId)
      .maybeSingle()
    if (eventCheckError) return { error: eventCheckError.message }
    if (!eventRow) {
      return { error: tErr('eventMissing') }
    }
    const eventCategory = (eventRow.category ?? '전투') as EventCategory
    const categoryMax = CATEGORY_PARTY_LIMITS[eventCategory]?.max ?? HARD_MAX_PARTIES
    if (partyNumber > categoryMax) return { error: tErr('invalidPartyNumber') }

    // Saving a never-created party with zero slots should be a no-op — otherwise
    // a single click on an empty panel creates a phantom party row that blocks
    // template loading and can't be removed via the UI.
    // 예외: 밤스쿼드 파티는 admin/owner 가 먼저 메타(콜러 지정 등) 만 설정해두고
    // 콜러가 나중에 슬롯/빌드를 채우는 플로우가 유효하므로 슬롯 0 개여도 생성 허용.
    if (!partyId && slots.length === 0 && !metaRow.is_bomb_squad) {
      revalidatePath(`/admin/dashboard/events/${eventId}`)
      return {}
    }

    let resolvedPartyId: string
    let recoveredSlotIds: string[] | null = null
    if (partyId) {
      resolvedPartyId = partyId
      // 콜러(= !isAdminOrOwner)는 is_bomb_squad / bomb_squad_kind / name /
      // caller_discord_id 같은 파티 메타를 건드릴 수 없다. UI 에서도 감추지만
      // 서버에서도 방어적으로 skip.
      if (isAdminOrOwner) {
        const { error: metaUpdErr } = await db
          .from('parties')
          .update(metaRow)
          .eq('guild_id', guildId)
          .eq('id', partyId)
        if (metaUpdErr) return { error: metaUpdErr.message }
      }
    } else {
      const { data, error } = await db
        .from('parties')
        .insert({ guild_id: guildId, event_id: eventId, party_number: partyNumber, ...metaRow })
        .select('id')
        .single()
      if (error) {
        if (error.code === '23503') {
          return { error: tErr('eventMissingForParty') }
        }
        // 23505 = (event_id, party_number) 충돌. router.refresh 가 props 에
        // 새 partyId 를 전파하기 전 Save 가 다시 발화한 경우(Save 직후 Publish,
        // 빠른 더블 클릭 등). 기존 row 의 id 로 fallback 하고 prior 슬롯은
        // recoveredSlotIds 로 합쳐 아래 cleanup 단계에서 한 번에 정리한다.
        if (error.code !== '23505') {
          return { error: error.message }
        }
        const { data: existing, error: lookupErr } = await db
          .from('parties')
          .select('id')
          .eq('guild_id', guildId)
          .eq('event_id', eventId)
          .eq('party_number', partyNumber)
          .maybeSingle()
        if (lookupErr) return { error: lookupErr.message }
        if (!existing) return { error: error.message }
        resolvedPartyId = existing.id
        if (isAdminOrOwner) {
          const { error: metaUpdErr } = await db
            .from('parties')
            .update(metaRow)
            .eq('guild_id', guildId)
            .eq('id', existing.id)
          if (metaUpdErr) return { error: metaUpdErr.message }
        }
        const { data: existingSlots, error: existingSlotErr } = await db
          .from('slots')
          .select('id')
          .eq('guild_id', guildId)
          .eq('party_id', existing.id)
        if (existingSlotErr) return { error: existingSlotErr.message }
        recoveredSlotIds = (existingSlots ?? []).map((s) => s.id as string)
      } else {
        resolvedPartyId = data.id
      }
    }

    const effectiveOriginalSlotIds = recoveredSlotIds
      ? Array.from(new Set([...originalSlotIds, ...recoveredSlotIds]))
      : originalSlotIds
    const keptIds = new Set(slots.map((s) => s.id).filter(Boolean) as string[])
    const removedIds = effectiveOriginalSlotIds.filter((id) => !keptIds.has(id))

    // Delete removed slots first so their slot_numbers free up before we renumber kept ones
    if (removedIds.length > 0) {
      const { error } = await db
        .from('slots')
        .delete()
        .eq('guild_id', guildId)
        .in('id', removedIds)
      if (error) return { error: error.message }
    }

    // A plain ascending-order UPDATE is not enough for arbitrary reorders
    // (swaps and permutations always collide on UNIQUE(party_id, slot_number)).
    // Park kept slots at temp numbers >20 first, then write the final values.
    // Migration 022 widens the slot_number CHECK to permit this transient range.
    const kept = slots.filter((s) => s.id)
    const TEMP_OFFSET = 1000
    for (let i = 0; i < kept.length; i++) {
      const { error } = await db
        .from('slots')
        .update({ slot_number: TEMP_OFFSET + i + 1 })
        .eq('guild_id', guildId)
        .eq('id', kept[i].id!)
      if (error) return { error: error.message }
    }

    for (const slot of kept) {
      const { error } = await db
        .from('slots')
        .update(slotToRow(resolvedPartyId, slot, guildId))
        .eq('guild_id', guildId)
        .eq('id', slot.id!)
      if (error) return { error: error.message }
    }

    // Insert new slots last
    const newSlots = slots.filter((s) => !s.id)
    if (newSlots.length > 0) {
      const { error } = await db
        .from('slots')
        .insert(newSlots.map((s) => slotToRow(resolvedPartyId, s, guildId)))
      if (error) return { error: error.message }
    }

    revalidatePath(`/admin/dashboard/events/${eventId}`)
    revalidatePath(`/events/${eventId}`)
    revalidatePath(`/events/${eventId}/party/${partyNumber}`)
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function clearSlotAssignment(slotId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForSlot(slotId)
    const guildId = await getSessionGuildId(session)
    const { error } = await db
      .from('slots')
      .update({ assigned_discord_id: null, assigned_username: null })
      .eq('guild_id', guildId)
      .eq('id', slotId)
    if (error) return { error: error.message }
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// 단일 슬롯 빌드(아이템/옵션/주문/스펙/역할명/메모 등) 만 업데이트. slot_number
// 와 party_id 는 DB 값으로 고정 — 재배치/이동은 파티 편집 화면의 전용 플로우.
// 할당 정보(assigned_*) 도 건드리지 않는다 — 그쪽은 clearSlotAssignment /
// assignSelfToSlot 이 담당.
export async function updateSingleSlot(
  slotId: string,
  slot: Omit<SlotPayload, 'id' | 'slot_number'>,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const db = await requireEventCreatorForSlot(slotId)
    const guildId = await getSessionGuildId(session)

    const { data: slotRow, error: slotErr } = await db
      .from('slots')
      .select('party_id, slot_number, parties!inner(event_id, party_number)')
      .eq('guild_id', guildId)
      .eq('id', slotId)
      .maybeSingle()
    if (slotErr) return { error: slotErr.message }
    if (!slotRow) return { error: tErr('serverError') }

    const party = Array.isArray(slotRow.parties) ? slotRow.parties[0] : slotRow.parties
    if (!party) return { error: tErr('serverError') }

    const row = slotToRow(slotRow.party_id, {
      ...slot,
      slot_number: slotRow.slot_number,
    })

    const { error: updErr } = await db
      .from('slots')
      .update(row)
      .eq('guild_id', guildId)
      .eq('id', slotId)
    if (updErr) return { error: updErr.message }

    revalidatePath(`/admin/dashboard/events/${party.event_id}`)
    revalidatePath(`/events/${party.event_id}`)
    revalidatePath(`/events/${party.event_id}/party/${party.party_number}`)
    revalidatePath('/')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
