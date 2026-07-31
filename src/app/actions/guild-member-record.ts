'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireCapability, requireLiveSession } from '@/lib/auth'
import { isDiscordId } from '@/lib/discord-id'
import { syncDiscordGuildNickname } from '@/lib/discord-nickname-sync'
import { getGuildMemberDirectoryEntry } from '@/lib/guild-member-directory'
import { CAP } from '@/lib/permissions'
import { publicActionError } from '@/lib/public-action-error'
import { getSessionGuildId } from '@/lib/tenant'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/

interface ActionResult {
  ok?: true
  error?: string
}

function normalizeDisplayName(value: unknown): string | null | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.normalize('NFKC').trim()
  if (!normalized) return null
  if (normalized.length > 64 || CONTROL_CHARACTERS.test(normalized)) {
    return undefined
  }
  return normalized
}

function revalidateMemberNameSurfaces(discordId: string): void {
  revalidatePath('/members')
  revalidatePath(`/members/${discordId}`)
  revalidatePath('/admin/dashboard/members')
  revalidatePath(`/admin/dashboard/members/${discordId}`)
  revalidatePath('/me')
  revalidatePath('/me/profile')
}

export async function saveGuildMemberDisplayName(input: {
  guildMemberId: string
  discordId: string
  displayName: string
}): Promise<ActionResult> {
  const t = await getTranslations('members')
  try {
    if (!UUID_PATTERN.test(input.guildMemberId)) {
      return { error: t('displayNameInvalid') }
    }
    const normalized = normalizeDisplayName(input.displayName)
    if (normalized === undefined) {
      return { error: t('displayNameInvalid') }
    }

    const session = await requireLiveSession()
    const db = await requireCapability(CAP.MEMBERS_MANAGE)
    const guildId = await getSessionGuildId(session)
    const stableMember = await getGuildMemberDirectoryEntry(
      guildId,
      input.discordId,
    )
    if (!stableMember || stableMember.guildMemberId !== input.guildMemberId) {
      return { error: t('displayNameMemberNotFound') }
    }

    const { error } = await db.rpc('set_guild_member_display_name', {
      p_guild_id: guildId,
      p_guild_member_id: input.guildMemberId,
      p_display_name: normalized,
      p_actor_discord_id: session.discordId,
    })
    if (error) {
      return {
        error: await publicActionError(error, 'actions/guild-member-record'),
      }
    }

    revalidateMemberNameSurfaces(input.discordId)
    return { ok: true }
  } catch (error) {
    return {
      error: await publicActionError(error, 'actions/guild-member-record'),
    }
  }
}

export async function applyGuildMemberNameToDiscord(input: {
  guildMemberId: string
  discordId: string
}): Promise<ActionResult> {
  const t = await getTranslations('members')
  try {
    if (
      !UUID_PATTERN.test(input.guildMemberId) ||
      !isDiscordId(input.discordId)
    ) {
      return { error: t('displayNameMemberNotFound') }
    }

    const session = await requireLiveSession()
    await requireCapability(CAP.MEMBERS_MANAGE)
    const guildId = await getSessionGuildId(session)
    const stableMember = await getGuildMemberDirectoryEntry(
      guildId,
      input.discordId,
    )
    if (
      !stableMember ||
      stableMember.guildMemberId !== input.guildMemberId ||
      !stableMember.displayName
    ) {
      return { error: t('displayNameMemberNotFound') }
    }

    const result = await syncDiscordGuildNickname({
      guildId,
      discordId: input.discordId,
      nickname: stableMember.displayName,
      source: 'admin_manual',
    })
    if (result.status === 'failed') {
      return { error: t('displayNameDiscordFailed') }
    }
    if (result.status === 'skipped') {
      return { error: t('displayNameDiscordUnavailable') }
    }
    return { ok: true }
  } catch (error) {
    return {
      error: await publicActionError(error, 'actions/guild-member-record'),
    }
  }
}
