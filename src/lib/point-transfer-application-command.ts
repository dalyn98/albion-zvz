import 'server-only'

import {
  ApplicationCommandError,
  executeApplicationCommand,
  loadApplicationCommandReceipt,
  type ApplicationCommandContext,
} from '@/lib/application-command'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { getAdminClient } from '@/lib/supabase-admin'

const MAX_RECIPIENTS = 50
const MAX_MEMO_LENGTH = 200
const POSTGRES_INT_MAX = 2_147_483_647

export interface PointTransferCommandInput {
  transfers: Array<{
    discordId: string
    amount: number
    memo?: string | null
  }>
}

interface PreparedPointTransfer {
  requestPayload: {
    transfers: Array<{
      discord_id: string
      amount: number
      memo: string | null
    }>
  }
  total: number
  spendableBefore: number
  recipients: Array<{
    discordId: string
    username: string
    amount: number
    memo: string | null
  }>
}

export interface PointTransferCommandResult extends PreparedPointTransfer {
  refId: string
  spendableAfter: number
  replayed: boolean
}

function normalizePointTransferInput(
  actorDiscordId: string,
  input: PointTransferCommandInput,
): {
  requestPayload: PreparedPointTransfer['requestPayload']
  total: number
  requested: Array<{ discordId: string; amount: number; memo: string | null }>
} {
  if (!Array.isArray(input.transfers) || input.transfers.length === 0) {
    throw new ApplicationCommandError('transfer_no_recipients')
  }
  if (input.transfers.length > MAX_RECIPIENTS) {
    throw new ApplicationCommandError('transfer_too_many_recipients', { max: MAX_RECIPIENTS })
  }

  const seen = new Set<string>()
  const requested = input.transfers.map((transfer) => {
    const discordId = typeof transfer.discordId === 'string' ? transfer.discordId.trim() : ''
    const memo = typeof transfer.memo === 'string' ? transfer.memo.trim() || null : null
    if (!discordId) throw new ApplicationCommandError('transfer_member_not_found')
    if (discordId === actorDiscordId) {
      throw new ApplicationCommandError('transfer_self')
    }
    if (seen.has(discordId)) {
      throw new ApplicationCommandError('transfer_duplicate_recipient')
    }
    seen.add(discordId)
    if (
      !Number.isInteger(transfer.amount) ||
      transfer.amount <= 0 ||
      transfer.amount > POSTGRES_INT_MAX
    ) {
      throw new ApplicationCommandError('transfer_invalid_amount')
    }
    if ((memo?.length ?? 0) > MAX_MEMO_LENGTH) {
      throw new ApplicationCommandError('transfer_memo_too_long', { max: MAX_MEMO_LENGTH })
    }
    return { discordId, amount: transfer.amount, memo }
  })
  const total = requested.reduce((sum, transfer) => sum + transfer.amount, 0)
  if (!Number.isSafeInteger(total) || total > POSTGRES_INT_MAX) {
    throw new ApplicationCommandError('transfer_invalid_amount')
  }
  return {
    requestPayload: {
      transfers: requested.map((transfer) => ({
        discord_id: transfer.discordId,
        amount: transfer.amount,
        memo: transfer.memo,
      })),
    },
    total,
    requested,
  }
}

export async function preparePointTransferApplicationCommand(
  context: Pick<ApplicationCommandContext, 'guildId' | 'actorDiscordId'>,
  input: PointTransferCommandInput,
): Promise<PreparedPointTransfer> {
  const normalized = normalizePointTransferInput(context.actorDiscordId, input)
  const { requested, total } = normalized

  const gate = await getAlbionOnboardingGateState(
    context.actorDiscordId,
    context.guildId,
  )
  if (!gate.resourceTrusted) {
    throw new ApplicationCommandError('transfer_albion_verification_required')
  }

  const db = getAdminClient()
  const [{ data: recipientRows, error: recipientError }, balance] = await Promise.all([
    db
      .from('guild_avatars')
      .select('discord_id, username, withdrawn_at')
      .eq('guild_id', context.guildId)
      .in('discord_id', requested.map((transfer) => transfer.discordId)),
    getMemberSpendablePointBalance(db, context.guildId, context.actorDiscordId),
  ])
  if (recipientError || balance.error) {
    throw new ApplicationCommandError('application_command_db_error', {
      cause: recipientError?.message ?? balance.error,
    })
  }
  const activeById = new Map(
    (recipientRows ?? [])
      .filter((row) => !row.withdrawn_at)
      .map((row) => [row.discord_id as string, (row.username as string | null)?.trim() ?? '']),
  )
  const recipients = requested.map((transfer) => {
    const username = activeById.get(transfer.discordId)
    if (username === undefined) {
      throw new ApplicationCommandError('transfer_member_not_found')
    }
    return {
      ...transfer,
      username: username || `<@${transfer.discordId}>`,
    }
  })
  if (balance.spendable < total) {
    throw new ApplicationCommandError('transfer_insufficient_balance', {
      balance: balance.spendable,
      total,
    })
  }

  return {
    requestPayload: normalized.requestPayload,
    total,
    spendableBefore: balance.spendable,
    recipients,
  }
}

export async function executePointTransferApplicationCommand(
  context: ApplicationCommandContext,
  input: PointTransferCommandInput,
): Promise<PointTransferCommandResult> {
  const normalized = normalizePointTransferInput(context.actorDiscordId, input)
  const existing = await loadApplicationCommandReceipt(
    'point.transfer',
    context,
    normalized.requestPayload,
  )
  let prepared: PreparedPointTransfer
  let receipt = existing
  if (existing) {
    const transfers = Array.isArray(existing.transfers) ? existing.transfers : []
    const recipients = transfers.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const row = entry as Record<string, unknown>
      if (
        typeof row.discord_id !== 'string' ||
        typeof row.username !== 'string' ||
        typeof row.amount !== 'number'
      ) return []
      return [{
        discordId: row.discord_id,
        username: row.username,
        amount: row.amount,
        memo: typeof row.memo === 'string' ? row.memo : null,
      }]
    })
    if (recipients.length !== normalized.requested.length) {
      throw new ApplicationCommandError('application_command_result_invalid')
    }
    prepared = {
      requestPayload: normalized.requestPayload,
      total: typeof existing.total === 'number' ? existing.total : normalized.total,
      spendableBefore:
        typeof existing.spendableBefore === 'number' ? existing.spendableBefore : 0,
      recipients,
    }
  } else {
    prepared = await preparePointTransferApplicationCommand(context, input)
    receipt = await executeApplicationCommand({
      commandName: 'point.transfer',
      context,
      requestPayload: prepared.requestPayload,
      executionPayload: {
        spendableBefore: prepared.spendableBefore,
        transfers: prepared.recipients.map((recipient) => ({
          discord_id: recipient.discordId,
          username: recipient.username,
          amount: recipient.amount,
          memo: recipient.memo,
        })),
      },
    })
  }
  if (!receipt) throw new ApplicationCommandError('application_command_result_invalid')
  const refId = typeof receipt.refId === 'string' ? receipt.refId : ''
  if (!refId) throw new ApplicationCommandError('application_command_result_invalid')

  const latest = await getMemberSpendablePointBalance(
    getAdminClient(),
    context.guildId,
    context.actorDiscordId,
  )
  if (latest.error) {
    throw new ApplicationCommandError('application_command_db_error', { cause: latest.error })
  }
  return {
    ...prepared,
    refId,
    spendableAfter: latest.spendable,
    replayed: receipt.replayed === true,
  }
}
