'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAnyCapability, requireCurrentMutationSession } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { publicActionError } from '@/lib/public-action-error'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import { parseTreasuryDepositLog } from '@/lib/treasury-deposit-log'
import { isApplicationCommandIdempotencyKey } from '@/lib/application-command-idempotency'

const MAX_IMPORT_ROWS = 2_000
const MAX_PURPOSE_NOTE = 300

export type TreasuryDepositPurpose = 'point_top_up' | 'guild_donation' | 'other'

export interface MemberTreasuryDeposit {
  id: string
  depositedAt: string
  amountSilver: number
}

export async function importTreasuryDepositLog(raw: string): Promise<{
  imported: number
  duplicates: number
  skippedLines: number[]
  error?: string
}> {
  const t = await getTranslations('treasuryDeposits')
  try {
    const session = await getSession()
    if (!session) return { imported: 0, duplicates: 0, skippedLines: [], error: t('unauthorized') }
    const db = await requireAnyCapability([CAP.DONATION_APPROVE])
    const guildId = await getSessionGuildId(session)
    const parsed = parseTreasuryDepositLog(raw)
    if (parsed.entries.length === 0) {
      return { imported: 0, duplicates: 0, skippedLines: parsed.skippedLines, error: t('noValidRows') }
    }
    if (parsed.entries.length > MAX_IMPORT_ROWS) {
      return { imported: 0, duplicates: 0, skippedLines: parsed.skippedLines, error: t('tooManyRows', { max: MAX_IMPORT_ROWS }) }
    }

    const rows = parsed.entries.map((entry) => ({
      guild_id: guildId,
      deposited_at: entry.depositedAt,
      depositor_name: entry.depositorName,
      amount_silver: entry.amountSilver,
      source_fingerprint: createHash('sha256').update(entry.fingerprintInput).digest('hex'),
      imported_by: session.discordId,
    }))
    const { data, error } = await db
      .from('guild_treasury_deposits')
      .upsert(rows, {
        onConflict: 'guild_id,source_fingerprint',
        ignoreDuplicates: true,
      })
      .select('id')
    if (error) {
      return {
        imported: 0,
        duplicates: 0,
        skippedLines: parsed.skippedLines,
        error: await publicActionError(error, 'actions/treasury-deposits'),
      }
    }

    const imported = data?.length ?? 0
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/me/wallet')
    revalidatePath('/me')
    return {
      imported,
      duplicates: parsed.entries.length - imported,
      skippedLines: parsed.skippedLines,
    }
  } catch (error) {
    return {
      imported: 0,
      duplicates: 0,
      skippedLines: [],
      error: await publicActionError(error, 'actions/treasury-deposits'),
    }
  }
}

async function trustedTreasuryMember(): Promise<
  | { guildId: string; discordId: string; nickname: string }
  | { error: string }
> {
  const t = await getTranslations('treasuryDeposits')
  const session = await requireCurrentMutationSession().catch(() => null)
  if (!session?.isMember) return { error: t('memberOnly') }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: t('verifiedCharacterRequired') }
  }
  const guildId = await getSessionGuildId(session)
  const gate = await getAlbionOnboardingGateState(session.discordId, guildId)
  const nickname = gate.identity?.nickname?.trim()
  if (!gate.resourceTrusted || !nickname) {
    return { error: t('verifiedCharacterRequired') }
  }
  return { guildId, discordId: session.discordId, nickname }
}

export async function listMyUnallocatedTreasuryDeposits(): Promise<{
  deposits: MemberTreasuryDeposit[]
  error?: string
}> {
  const actor = await trustedTreasuryMember()
  if ('error' in actor) return { deposits: [], error: actor.error }
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_treasury_deposits')
    .select('id, deposited_at, amount_silver')
    .eq('guild_id', actor.guildId)
    .eq('status', 'unallocated')
    .ilike('depositor_name', actor.nickname)
    .order('deposited_at', { ascending: false })
    .limit(100)
  if (error) {
    return { deposits: [], error: await publicActionError(error, 'actions/treasury-deposits') }
  }
  return {
    deposits: (data ?? []).map((row) => ({
      id: row.id as string,
      depositedAt: row.deposited_at as string,
      amountSilver: Number(row.amount_silver) || 0,
    })),
  }
}

export async function allocateMyTreasuryDeposit(input: {
  depositId: string
  purpose: TreasuryDepositPurpose
  purposeNote?: string
  idempotencyKey: string
}): Promise<{ status?: 'auto_credited' | 'recorded'; amountSilver?: number; error?: string }> {
  const t = await getTranslations('treasuryDeposits')
  const actor = await trustedTreasuryMember()
  if ('error' in actor) return { error: actor.error }
  if (!['point_top_up', 'guild_donation', 'other'].includes(input.purpose)) {
    return { error: t('invalidPurpose') }
  }
  const purposeNote = input.purposeNote?.trim() || null
  if (purposeNote && purposeNote.length > MAX_PURPOSE_NOTE) {
    return { error: t('noteTooLong', { max: MAX_PURPOSE_NOTE }) }
  }
  if (!isApplicationCommandIdempotencyKey(input.idempotencyKey)) {
    return { error: t('invalidRequest') }
  }

  const db = getAdminClient()
  const { data, error } = await db.rpc('allocate_treasury_deposit', {
    p_guild_id: actor.guildId,
    p_deposit_id: input.depositId,
    p_discord_id: actor.discordId,
    p_expected_depositor_name: actor.nickname,
    p_purpose: input.purpose,
    p_purpose_note: purposeNote,
    p_idempotency_key: input.idempotencyKey,
  })
  if (error) {
    if (error.message.includes('TREASURY_DEPOSIT_ALREADY_ALLOCATED')) return { error: t('alreadyAllocated') }
    if (error.message.includes('TREASURY_DEPOSITOR_MISMATCH')) return { error: t('nameMismatch') }
    if (error.message.includes('TREASURY_DEPOSIT_NOT_FOUND')) return { error: t('notFound') }
    return { error: await publicActionError(error, 'actions/treasury-deposits') }
  }

  const result = data as { status?: 'auto_credited' | 'recorded'; amountSilver?: number } | null
  revalidatePath('/me/wallet')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/approvals')
  revalidatePath('/', 'layout')
  return {
    status: result?.status,
    amountSilver: Number(result?.amountSilver) || 0,
  }
}
