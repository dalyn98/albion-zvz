'use server'

// 운영진 카드 (`/g/<slug>` 의 AdminTeamGrid) 의 디스코드 핸들 편집.
//
// guild_avatars.public_discord_handle 컬럼을 어드민 본인이 직접 채운다 — OAuth
// 로 자동 채워지는 username 과 별개. 카드 클릭 시 이 값이 클립보드에 복사되어
// 외부인이 친구추가/DM 보낼 수 있게 한다.
//
// 권한: 본 길드 어드민만. 본인이 아닌 다른 어드민의 핸들도 편집 가능 (운영진
// 정보는 길드 공개 정보의 일부 — 어드민 한 명이 일괄 관리하는 게 자연스럽다).

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'

const HANDLE_MAX_LENGTH = 64

export async function updateAdminTeamHandleAction(input: {
  discordId: string
  handle: string
}): Promise<{ updated?: boolean; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session || !session.isAdmin) return { error: tErr('unauthorized') }

    const guildId = await getSessionGuildId(session)
    const targetDiscordId = (input.discordId ?? '').trim()
    if (!targetDiscordId) return { error: tErr('emptyValue') }

    const trimmed = (input.handle ?? '').trim()
    if (trimmed.length > HANDLE_MAX_LENGTH) {
      return { error: tErr('valueTooLong', { max: HANDLE_MAX_LENGTH }) }
    }

    const db = getAdminClient()
    // 본 길드의 어드민인 경우만 편집 — guild_avatars 의 (guild_id, discord_id)
    // 매칭 + is_admin=true 조건을 update WHERE 에 포함해 cross-tenant/escalation
    // 차단.
    const { error } = await db
      .from('guild_avatars')
      .update({ public_discord_handle: trimmed.length === 0 ? null : trimmed })
      .eq('guild_id', guildId)
      .eq('discord_id', targetDiscordId)
      .eq('is_admin', true)
    if (error) throw new Error(error.message)

    revalidatePath('/g/[slug]', 'page')
    return { updated: true }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
