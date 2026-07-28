'use server'

import { revalidatePath } from 'next/cache'
import { logAdminAction } from '@/lib/admin-audit'
import { requireCapability } from '@/lib/auth'
import {
  isValidExchangeRestrictionMemberId,
  normalizeMemberExchangeRestriction,
  type MemberExchangeRestrictionInput,
} from '@/lib/member-exchange-restrictions'
import { CAP } from '@/lib/permissions'
import { publicActionError } from '@/lib/public-action-error'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'

interface ActionResult {
  ok: boolean
  code?: string
}

function revalidateExchangeRestrictionPaths(discordId: string): void {
  revalidatePath('/admin/dashboard/content-compliance')
  revalidatePath(`/members/${discordId}`)
  revalidatePath('/me')
  revalidatePath('/me/requests')
  revalidatePath('/', 'layout')
}

export async function setMemberExchangeRestriction(
  input: MemberExchangeRestrictionInput,
): Promise<ActionResult> {
  const normalized = normalizeMemberExchangeRestriction(input, new Date())
  if (!normalized.ok) return { ok: false, code: normalized.code }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = await requireCapability(CAP.EXCHANGE_APPROVE)
    const value = normalized.value
    const { error } = await db.rpc('set_member_exchange_restriction', {
      p_guild_id: guildId,
      p_discord_id: value.discordId,
      p_blocked_until: value.blockedUntil,
      p_reason: value.reason,
      p_actor: session.discordId,
    })
    if (error) {
      if (error.message.includes('MEMBER_NOT_FOUND')) {
        return { ok: false, code: 'invalidMember' }
      }
      return {
        ok: false,
        code: await publicActionError(error, 'actions/member-exchange-restrictions'),
      }
    }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'member.exchange_restriction.set',
      targetKind: 'member',
      targetDiscordId: value.discordId,
      details: {
        blockedUntil: value.blockedUntil,
        reason: value.reason,
      },
    })
    revalidateExchangeRestrictionPaths(value.discordId)
    return { ok: true }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return { ok: false, code: 'unauthorized' }
    }
    return {
      ok: false,
      code: await publicActionError(error, 'actions/member-exchange-restrictions'),
    }
  }
}

export async function clearMemberExchangeRestriction(
  discordId: string,
): Promise<ActionResult> {
  if (!isValidExchangeRestrictionMemberId(discordId)) {
    return { ok: false, code: 'invalidMember' }
  }

  try {
    const session = await getSession()
    if (!session) return { ok: false, code: 'unauthorized' }
    const guildId = await getSessionGuildId(session)
    const db = await requireCapability(CAP.EXCHANGE_APPROVE)
    const { error } = await db.rpc('clear_member_exchange_restriction', {
      p_guild_id: guildId,
      p_discord_id: discordId,
    })
    if (error) {
      return {
        ok: false,
        code: await publicActionError(error, 'actions/member-exchange-restrictions'),
      }
    }

    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'member.exchange_restriction.clear',
      targetKind: 'member',
      targetDiscordId: discordId,
    })
    revalidateExchangeRestrictionPaths(discordId)
    return { ok: true }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return { ok: false, code: 'unauthorized' }
    }
    return {
      ok: false,
      code: await publicActionError(error, 'actions/member-exchange-restrictions'),
    }
  }
}
