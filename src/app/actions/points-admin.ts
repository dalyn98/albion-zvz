'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { logAdminAction } from '@/lib/admin-audit'

const MEMO_MAX_LENGTH = 200

// 관리자가 길드원의 포인트(실버)를 +/- 수동 조정한다. 리기어/환전 플로우와 달리
// 참조할 요청 레코드가 없어 ref_id는 null, reason은 'admin_adjust'를 사용.
export async function adjustMemberPoints(
  discordId: string,
  deltaSilver: number,
  memo: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (!Number.isInteger(deltaSilver) || deltaSilver === 0) {
      return { error: tErr('invalidDelta') }
    }
    const trimmedMemo = memo.trim()
    if (!trimmedMemo) return { error: tErr('memoRequired') }
    if (trimmedMemo.length > MEMO_MAX_LENGTH) {
      return { error: tErr('memoTooLong', { max: MEMO_MAX_LENGTH }) }
    }

    const db = await requireAdmin()
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    // 대상 길드원이 실제로 존재하는지 확인 — 잘못된 discord_id로 ledger를 더럽히지
    // 않도록 방어. 잔액 검증은 하지 않음(관리자는 마이너스 조정도 허용).
    const { data: avatar, error: avatarErr } = await db
      .from('guild_avatars')
      .select('discord_id')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .maybeSingle()
    if (avatarErr) return { error: avatarErr.message }
    if (!avatar) return { error: tErr('memberNotFound') }

    const { error } = await db.from('point_ledger').insert({
      guild_id: guildId,
      discord_id: discordId,
      delta: deltaSilver,
      reason: 'admin_adjust',
      memo: trimmedMemo,
      handled_by: session.discordId,
      handled_by_username: session.username,
    })
    if (error) return { error: error.message }

    revalidatePath(`/members/${discordId}`)
    revalidatePath('/members')
    revalidatePath('/me')
    revalidatePath('/me/profile')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'points.adjust',
      targetDiscordId: discordId,
      targetKind: 'member',
      details: { delta: deltaSilver, memo: trimmedMemo },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
