'use server'

// 이벤트별 게스트 초대 링크 관리용 server action.
// - `createEventGuestToken(eventId)` — 랜덤 토큰 생성 + event_guest_tokens insert.
//   만료는 `events.gather_at + 24h` (gather_at 이 null 이면 now + 14d fallback).
// - `listEventGuestTokens(eventId)` — 관리자 UI 에서 보여줄 토큰 목록.
// - `revokeEventGuestToken(tokenId, eventId)` — 폐기(revoke). 이벤트 권한 체크 필수.

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireEventCreatorForEvent } from '@/lib/auth'

export interface EventGuestToken {
  id: string
  token: string
  created_by: string | null
  created_by_username: string | null
  created_at: string
  expires_at: string | null
  revoked_at: string | null
}

function randomToken(): string {
  // 24 bytes → base64url → 32 characters, URL 안전. URLSearchParams 로
  // encode 해도 추가 이스케이프가 붙지 않아 링크가 짧고 깔끔.
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const FALLBACK_TTL_MS = 14 * 24 * 60 * 60 * 1000 // 14 일
const POST_GATHER_TTL_MS = 24 * 60 * 60 * 1000 // gather_at + 24h

export async function createEventGuestToken(
  eventId: string,
): Promise<{ token?: EventGuestToken; error?: string }> {
  try {
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const db = await requireEventCreatorForEvent(eventId)

    const { data: event, error: eventError } = await db
      .from('events')
      .select('gather_at')
      .eq('id', eventId)
      .maybeSingle()
    if (eventError) return { error: eventError.message }
    if (!event) return { error: 'Event not found' }

    const expiresAt = event.gather_at
      ? new Date(new Date(event.gather_at).getTime() + POST_GATHER_TTL_MS)
      : new Date(Date.now() + FALLBACK_TTL_MS)

    const guildId = await getSessionGuildId(session)
    const token = randomToken()
    const { data: inserted, error: insertError } = await db
      .from('event_guest_tokens')
      .insert({
        guild_id: guildId,
        event_id: eventId,
        token,
        created_by: session.discordId,
        created_by_username: session.username,
        expires_at: expiresAt.toISOString(),
      })
      .select('id, token, created_by, created_by_username, created_at, expires_at, revoked_at')
      .single()
    if (insertError) return { error: insertError.message }

    revalidatePath(`/events/${eventId}`)
    return { token: inserted as EventGuestToken }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function listEventGuestTokens(
  eventId: string,
): Promise<{ tokens?: EventGuestToken[]; error?: string }> {
  try {
    const db = await requireEventCreatorForEvent(eventId)
    const { data, error } = await db
      .from('event_guest_tokens')
      .select('id, token, created_by, created_by_username, created_at, expires_at, revoked_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
    if (error) return { error: error.message }
    return { tokens: (data ?? []) as EventGuestToken[] }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function revokeEventGuestToken(
  tokenId: string,
  eventId: string,
): Promise<{ error?: string }> {
  try {
    const db = await requireEventCreatorForEvent(eventId)
    const { error } = await db
      .from('event_guest_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', tokenId)
      .eq('event_id', eventId)
    if (error) return { error: error.message }
    revalidatePath(`/events/${eventId}`)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
