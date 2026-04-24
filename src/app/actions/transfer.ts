'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAlbionVerified } from '@/lib/albion-identity'

// 길드원 → 길드원 포인트 양도. 여러 명 일괄 지급 지원.
// 원자성은 RPC transfer_points 가 보장(advisory lock + 잔액 체크 + 쌍 기록).
// 성공 시 revalidatePath 로 송신자 + 모든 수신자 페이지의 캐시를 갱신.

const MAX_RECIPIENTS = 50
const MAX_MEMO_LENGTH = 200

export interface TransferInput {
  discordId: string
  username: string
  amount: number
  memo?: string
}

function mapRpcError(message: string, tErr: Awaited<ReturnType<typeof getTranslations<'memberActionError'>>>, balance: number): string {
  if (message.includes('INSUFFICIENT_BALANCE')) {
    return tErr('insufficientBalance', { balance: balance.toLocaleString() })
  }
  if (message.includes('SELF_TRANSFER')) return tErr('transferSelf')
  if (message.includes('NO_RECIPIENTS')) return tErr('transferNoRecipients')
  if (message.includes('INVALID_AMOUNT')) return tErr('transferInvalidAmount')
  if (message.includes('MEMBER_NOT_FOUND')) return tErr('transferMemberNotFound')
  return message
}

export async function transferPoints(
  transfers: TransferInput[],
): Promise<{ error?: string; refId?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }
  const guildId = await getSessionGuildId(session)
  const albionError = await requireAlbionVerified(session.discordId, guildId)
  if (albionError) return { error: albionError }

  if (!Array.isArray(transfers) || transfers.length === 0) {
    return { error: tErr('transferNoRecipients') }
  }
  if (transfers.length > MAX_RECIPIENTS) {
    return { error: tErr('transferTooManyRecipients', { max: MAX_RECIPIENTS }) }
  }

  const seen = new Set<string>()
  for (const t of transfers) {
    if (!t.discordId) return { error: tErr('transferMemberNotFound') }
    if (t.discordId === session.discordId) return { error: tErr('transferSelf') }
    if (seen.has(t.discordId)) return { error: tErr('transferDuplicateRecipient') }
    seen.add(t.discordId)
    if (!Number.isInteger(t.amount) || t.amount <= 0) {
      return { error: tErr('transferInvalidAmount') }
    }
    if (t.memo && t.memo.length > MAX_MEMO_LENGTH) {
      return { error: tErr('transferMemoTooLong', { max: MAX_MEMO_LENGTH }) }
    }
  }

  const db = getAdminClient()

  // 서버에서 잔액을 먼저 확인 (UX 용 빠른 실패). RPC 가 lock 아래에서 재확인하므로
  // 이 체크가 race 를 유발하진 않는다.
  const total = transfers.reduce((sum, t) => sum + t.amount, 0)
  const { data: ledger, error: ledgerError } = await db
    .from('point_ledger')
    .select('delta')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (ledgerError) return { error: ledgerError.message }
  const balance = (ledger ?? []).reduce((sum, r) => sum + r.delta, 0)
  if (balance < total) {
    return { error: tErr('insufficientBalance', { balance: balance.toLocaleString() }) }
  }

  const payload = transfers.map((t) => ({
    discord_id: t.discordId,
    username: t.username ?? '',
    amount: t.amount,
    memo: t.memo?.trim() || null,
  }))

  const { data, error } = await db.rpc('transfer_points', {
    p_from: session.discordId,
    p_transfers: payload,
  })
  if (error) return { error: mapRpcError(error.message, tErr, balance) }

  revalidatePath('/me')
  revalidatePath('/me/profile')
  revalidatePath(`/members/${session.discordId}`)
  for (const t of transfers) {
    revalidatePath(`/members/${t.discordId}`)
  }
  revalidatePath('/members')

  return { refId: typeof data === 'string' ? data : undefined }
}

export interface TransferCandidate {
  discord_id: string
  username: string
  avatar: string | null
}

// 양도 대상 후보: 길드 아바타 중 본인 제외. 게스트는 대상에서 제외 (RPC 도 동일).
export async function listTransferCandidates(): Promise<{
  candidates: TransferCandidate[]
  error?: string
}> {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { candidates: [], error: tErr('loginRequired') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id, username, avatar')
    .eq('guild_id', guildId)
    .neq('discord_id', session.discordId)
    .order('username', { ascending: true })
  if (error) return { candidates: [], error: error.message }
  return { candidates: (data ?? []) as TransferCandidate[] }
}
