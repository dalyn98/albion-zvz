'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { requireCurrentMutationSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import {
  executePointTransferApplicationCommand,
} from '@/lib/point-transfer-application-command'
import {
  ApplicationCommandError,
} from '@/lib/application-command'
import { isApplicationCommandIdempotencyKey } from '@/lib/application-command-idempotency'

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
  if (
    message.includes('INSUFFICIENT_BALANCE') ||
    message.includes('transfer_insufficient_balance')
  ) {
    return tErr('insufficientBalance', { balance: balance.toLocaleString() })
  }
  if (message.includes('SELF_TRANSFER') || message.includes('transfer_self')) {
    return tErr('transferSelf')
  }
  if (message.includes('NO_RECIPIENTS') || message.includes('transfer_no_recipients')) {
    return tErr('transferNoRecipients')
  }
  if (message.includes('transfer_too_many_recipients')) {
    return tErr('transferTooManyRecipients', { max: MAX_RECIPIENTS })
  }
  if (message.includes('transfer_duplicate_recipient')) {
    return tErr('transferDuplicateRecipient')
  }
  if (message.includes('transfer_memo_too_long')) {
    return tErr('transferMemoTooLong', { max: MAX_MEMO_LENGTH })
  }
  if (message.includes('INVALID_AMOUNT') || message.includes('transfer_invalid_amount')) {
    return tErr('transferInvalidAmount')
  }
  if (
    message.includes('MEMBER_NOT_FOUND') ||
    message.includes('transfer_member_not_found')
  ) {
    return tErr('transferMemberNotFound')
  }
  if (message.includes('transfer_albion_verification_required')) {
    return tErr('albionVerificationRequired')
  }
  return tErr('serverError')
}

export async function transferPoints(
  transfers: TransferInput[],
  idempotencyKey?: string,
): Promise<{ error?: string; refId?: string }> {
  const tErr = await getTranslations('memberActionError')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session) return { error: tErr('loginRequired') }
  if (!session.isMember) return { error: tErr('memberOnly') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: tErr('localAccountResourceBlocked') }
  }
  const guildId = await getSessionGuildId(session)
  const commandId = isApplicationCommandIdempotencyKey(idempotencyKey)
    ? idempotencyKey
    : crypto.randomUUID()
  let result
  try {
    result = await executePointTransferApplicationCommand({
      guildId,
      actorDiscordId: session.discordId,
      actorUsername: session.username,
      source: 'web',
      correlationId: commandId,
      idempotencyKey: commandId,
    }, {
      transfers: transfers.map((transfer) => ({
        discordId: transfer.discordId,
        amount: transfer.amount,
        memo: transfer.memo,
      })),
    })
  } catch (error) {
    const balance =
      error instanceof ApplicationCommandError &&
      typeof error.details.balance === 'number'
        ? error.details.balance
        : 0
    return {
      error: mapRpcError(
        error instanceof Error ? error.message : String(error),
        tErr,
        balance,
      ),
    }
  }

  revalidatePath('/me')
  revalidatePath('/me/profile')
  revalidatePath(`/members/${session.discordId}`)
  for (const t of transfers) {
    revalidatePath(`/members/${t.discordId}`)
  }
  revalidatePath('/members')
  revalidatePath('/', 'layout')

  return { refId: result.refId }
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
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { candidates: [], error: tErr('localAccountResourceBlocked') }
  }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id, username, avatar')
    .eq('guild_id', guildId)
    .neq('discord_id', session.discordId)
    .order('username', { ascending: true })
  if (error) return { candidates: [], error: await publicActionError(error, 'actions/transfer') }
  return { candidates: (data ?? []) as TransferCandidate[] }
}
