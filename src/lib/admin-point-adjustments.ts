import { logAdminAction } from '@/lib/admin-audit'
import type { getAdminClient } from '@/lib/supabase-admin'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

export const ADMIN_POINT_ADJUSTMENT_MEMO_MAX_LENGTH = 200
export const POINT_LEDGER_DELTA_ABS_MAX = 2_147_483_647

export type AdminPointAdjustmentErrorCode =
  | 'invalid_delta'
  | 'memo_required'
  | 'memo_too_long'
  | 'member_not_found'
  | 'db_error'

export interface AdminPointAdjustmentSuccess {
  ok: true
  delta: number
  memo: string
  targetDiscordId: string
  targetUsername: string | null
}

export interface AdminPointAdjustmentFailure {
  ok: false
  code: AdminPointAdjustmentErrorCode
  message?: string
}

export type AdminPointAdjustmentResult =
  | AdminPointAdjustmentSuccess
  | AdminPointAdjustmentFailure

export interface ApplyAdminPointAdjustmentInput {
  guildId: string
  targetDiscordId: string
  delta: number
  memo: string
  adminDiscordId: string
  adminUsername: string | null
  source?: 'discord_command'
}

export function validateAdminPointAdjustmentInput(
  delta: number,
  memo: string,
): { ok: true; memo: string } | AdminPointAdjustmentFailure {
  if (
    !Number.isInteger(delta) ||
    delta === 0 ||
    Math.abs(delta) > POINT_LEDGER_DELTA_ABS_MAX
  ) {
    return { ok: false, code: 'invalid_delta' }
  }

  const trimmedMemo = memo.trim()
  if (!trimmedMemo) return { ok: false, code: 'memo_required' }
  if (trimmedMemo.length > ADMIN_POINT_ADJUSTMENT_MEMO_MAX_LENGTH) {
    return { ok: false, code: 'memo_too_long' }
  }

  return { ok: true, memo: trimmedMemo }
}

export async function applyAdminPointAdjustment(
  db: SupabaseAdminClient,
  input: ApplyAdminPointAdjustmentInput,
): Promise<AdminPointAdjustmentResult> {
  const validated = validateAdminPointAdjustmentInput(input.delta, input.memo)
  if (!validated.ok) return validated

  const { data: avatar, error: avatarErr } = await db
    .from('guild_avatars')
    .select('discord_id, username')
    .eq('guild_id', input.guildId)
    .eq('discord_id', input.targetDiscordId)
    .maybeSingle()
  if (avatarErr) return { ok: false, code: 'db_error', message: avatarErr.message }
  if (!avatar) return { ok: false, code: 'member_not_found' }

  const { error } = await db.from('point_ledger').insert({
    guild_id: input.guildId,
    discord_id: input.targetDiscordId,
    delta: input.delta,
    reason: 'admin_adjust',
    memo: validated.memo,
    handled_by: input.adminDiscordId,
    handled_by_username: input.adminUsername,
  })
  if (error) return { ok: false, code: 'db_error', message: error.message }

  await logAdminAction({
    guildId: input.guildId,
    adminDiscordId: input.adminDiscordId,
    action: 'points.adjust',
    targetDiscordId: input.targetDiscordId,
    targetKind: 'member',
    details: input.source
      ? { delta: input.delta, memo: validated.memo, source: input.source }
      : { delta: input.delta, memo: validated.memo },
  })

  return {
    ok: true,
    delta: input.delta,
    memo: validated.memo,
    targetDiscordId: input.targetDiscordId,
    targetUsername: (avatar.username as string | null) ?? null,
  }
}
