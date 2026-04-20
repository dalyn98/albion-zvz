'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import type { OpponentGuild } from '@/types'

const MAX_GUILD_NAME_LENGTH = 100
const MAX_NOTES_LENGTH = 500

// Read access — 전투기록 페이지나 전투 편집 콤보박스에서 쓰이므로 일반
// 로그인 사용자도 목록을 볼 수 있게 둔다. 쓰기 경로는 requireAdmin.
export async function listOpponentGuilds(): Promise<{
  guilds: OpponentGuild[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { guilds: [], error: 'Unauthorized' }
    const db = getAdminClient()
    const { data, error } = await db
      .from('opponent_guilds')
      .select('id, name, notes, created_at')
      .order('name')
    if (error) return { guilds: [], error: error.message }
    return { guilds: (data ?? []) as OpponentGuild[] }
  } catch (e) {
    return { guilds: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function createOpponentGuild(
  name: string,
  notes: string,
): Promise<{ guild?: OpponentGuild; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('missingOpponentGuild') }
    if (trimmed.length > MAX_GUILD_NAME_LENGTH) {
      return { error: tErr('opponentGuildTooLong', { max: MAX_GUILD_NAME_LENGTH }) }
    }
    const trimmedNotes = notes.trim().slice(0, MAX_NOTES_LENGTH) || null

    const db = await requireAdmin()

    // 대소문자 무시 중복 검사. functional unique index 가 걸려있지만 사용자가
    // 바로 납득할 수 있는 에러 메시지를 위해 직접 체크한다.
    const { data: existing, error: checkErr } = await db
      .from('opponent_guilds')
      .select('id, name')
      .ilike('name', trimmed)
      .maybeSingle()
    if (checkErr) return { error: checkErr.message }
    if (existing) return { error: tErr('opponentGuildDuplicate', { name: existing.name }) }

    const { data, error } = await db
      .from('opponent_guilds')
      .insert({ name: trimmed, notes: trimmedNotes })
      .select('id, name, notes, created_at')
      .single()
    if (error) return { error: error.message }

    revalidatePath('/admin/dashboard/opponent-guilds')
    return { guild: data as OpponentGuild }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateOpponentGuild(
  id: string,
  name: string,
  notes: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const trimmed = name.trim()
    if (!trimmed) return { error: tErr('missingOpponentGuild') }
    if (trimmed.length > MAX_GUILD_NAME_LENGTH) {
      return { error: tErr('opponentGuildTooLong', { max: MAX_GUILD_NAME_LENGTH }) }
    }
    const trimmedNotes = notes.trim().slice(0, MAX_NOTES_LENGTH) || null

    const db = await requireAdmin()

    const { data: existing, error: checkErr } = await db
      .from('opponent_guilds')
      .select('id, name')
      .ilike('name', trimmed)
      .maybeSingle()
    if (checkErr) return { error: checkErr.message }
    if (existing && existing.id !== id) {
      return { error: tErr('opponentGuildDuplicate', { name: existing.name }) }
    }

    const { error } = await db
      .from('opponent_guilds')
      .update({ name: trimmed, notes: trimmedNotes })
      .eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/admin/dashboard/opponent-guilds')
    revalidatePath('/battle-records')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteOpponentGuild(id: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAdmin()

    // FK 는 ON DELETE SET NULL 이라 과거 event_battles 기록은 보존되고
    // opponent_guild_id 만 NULL 로 빠진다. 여기서는 단순 삭제만 수행.
    const { error } = await db.from('opponent_guilds').delete().eq('id', id)
    if (error) return { error: error.message }

    revalidatePath('/admin/dashboard/opponent-guilds')
    revalidatePath('/battle-records')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
