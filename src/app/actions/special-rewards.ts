'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireCapability } from '@/lib/auth'
import { CAP } from '@/lib/permissions'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { publicActionError } from '@/lib/public-action-error'
import { isApplicationCommandIdempotencyKey } from '@/lib/application-command-idempotency'
import { isPostgresPositiveInt } from '@/lib/postgres-int'
import { logAdminAction } from '@/lib/admin-audit'

const MAX_RECIPIENTS = 500
const MAX_MEMO_LENGTH = 300

export async function grantSpecialReward(input: {
  discordIds: string[]
  amountPerMember: number
  memo: string
  idempotencyKey: string
  confirmation: string
}): Promise<{ grantId?: string; recipientCount?: number; totalPoints?: number; error?: string }> {
  const t = await getTranslations('specialRewards')
  try {
    const session = await getSession()
    if (!session) return { error: t('unauthorized') }
    const uniqueRecipients = [...new Set(input.discordIds.filter(Boolean))]
    if (
      uniqueRecipients.length === 0 ||
      uniqueRecipients.length !== input.discordIds.length ||
      uniqueRecipients.length > MAX_RECIPIENTS
    ) {
      return { error: t('invalidRecipients', { max: MAX_RECIPIENTS }) }
    }
    if (!isPostgresPositiveInt(input.amountPerMember)) return { error: t('invalidAmount') }
    const memo = input.memo.trim()
    if (!memo || memo.length > MAX_MEMO_LENGTH) {
      return { error: t('invalidMemo', { max: MAX_MEMO_LENGTH }) }
    }
    if (input.confirmation !== 'SPECIAL REWARD') return { error: t('confirmationMismatch') }
    if (!isApplicationCommandIdempotencyKey(input.idempotencyKey)) return { error: t('invalidRequest') }

    const db = await requireCapability(CAP.SPECIAL_REWARD_GRANT)
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db.rpc('grant_special_reward', {
      p_guild_id: guildId,
      p_discord_ids: uniqueRecipients,
      p_amount_per_member: input.amountPerMember,
      p_memo: memo,
      p_actor_discord_id: session.discordId,
      p_actor_username: session.username,
      p_idempotency_key: input.idempotencyKey,
      p_confirmation: input.confirmation,
    })
    if (error) {
      if (error.message.includes('SPECIAL_REWARD_MEMBER_NOT_FOUND')) return { error: t('memberNotFound') }
      if (error.message.includes('SPECIAL_REWARD_IDEMPOTENCY_CONFLICT')) return { error: t('requestConflict') }
      if (error.message.includes('SPECIAL_REWARD_CONFIRMATION_REQUIRED')) return { error: t('confirmationMismatch') }
      return { error: await publicActionError(error, 'actions/special-rewards') }
    }
    const result = data as {
      grantId?: string
      recipientCount?: number
      totalPoints?: number
      replayed?: boolean
    } | null
    if (!result?.grantId) return { error: t('serverError') }

    if (!result.replayed) {
      await logAdminAction({
        guildId,
        adminDiscordId: session.discordId,
        action: 'points.special_reward.grant',
        targetId: result.grantId,
        targetKind: 'special_reward',
        details: {
          recipientCount: result.recipientCount ?? uniqueRecipients.length,
          amountPerMember: input.amountPerMember,
          totalPoints: result.totalPoints ?? input.amountPerMember * uniqueRecipients.length,
          memo,
        },
      })
    }
    revalidatePath('/admin/dashboard/special-rewards')
    revalidatePath('/members')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    return {
      grantId: result.grantId,
      recipientCount: Number(result.recipientCount) || uniqueRecipients.length,
      totalPoints: Number(result.totalPoints) || input.amountPerMember * uniqueRecipients.length,
    }
  } catch (error) {
    return { error: await publicActionError(error, 'actions/special-rewards') }
  }
}
