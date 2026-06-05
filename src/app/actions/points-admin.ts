'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import {
  ADMIN_POINT_ADJUSTMENT_MEMO_MAX_LENGTH,
  applyAdminPointAdjustment,
  validateAdminPointAdjustmentInput,
  type AdminPointAdjustmentFailure,
} from '@/lib/admin-point-adjustments'

function pointAdjustmentErrorMessage(
  error: AdminPointAdjustmentFailure,
  tErr: Awaited<ReturnType<typeof getTranslations>>,
): string {
  switch (error.code) {
    case 'invalid_delta':
      return tErr('invalidDelta')
    case 'memo_required':
      return tErr('memoRequired')
    case 'memo_too_long':
      return tErr('memoTooLong', { max: ADMIN_POINT_ADJUSTMENT_MEMO_MAX_LENGTH })
    case 'member_not_found':
      return tErr('memberNotFound')
    case 'db_error':
      return error.message ?? tErr('serverError')
  }
}

// 관리자가 길드원의 포인트(실버)를 +/- 수동 조정한다. 리기어/환전 플로우와 달리
// 참조할 요청 레코드가 없어 ref_id는 null, reason은 'admin_adjust'를 사용.
export async function adjustMemberPoints(
  discordId: string,
  deltaSilver: number,
  memo: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const validated = validateAdminPointAdjustmentInput(deltaSilver, memo)
    if (!validated.ok) {
      return { error: pointAdjustmentErrorMessage(validated, tErr) }
    }

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const result = await applyAdminPointAdjustment(db, {
      guildId,
      targetDiscordId: discordId,
      delta: deltaSilver,
      memo,
      adminDiscordId: session.discordId,
      adminUsername: session.username,
    })
    if (!result.ok) return { error: pointAdjustmentErrorMessage(result, tErr) }

    revalidatePath(`/members/${discordId}`)
    revalidatePath('/members')
    revalidatePath('/me')
    revalidatePath('/me/profile')
    revalidatePath('/', 'layout')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
