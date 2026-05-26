'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import {
  loadKillbotAdminState,
  saveKillbotConfig,
  sendKillbotTestMessage,
  type KillbotAdminState,
  type SaveKillbotConfigInput,
} from '@/lib/killbot'

const KILLBOT_MANAGE_CAPS = [CAP.SETTINGS_GENERAL] as const

async function requireKillbotManager(): Promise<string> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if (!session.isAdmin && !sessionHasAny(session, KILLBOT_MANAGE_CAPS)) {
    throw new Error('Unauthorized')
  }
  return getSessionGuildId(session)
}

export async function getKillbotAdminState(): Promise<{
  state?: KillbotAdminState
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const guildId = await requireKillbotManager()
    const state = await loadKillbotAdminState(getAdminClient(), guildId)
    return { state }
  } catch (err) {
    return { error: err instanceof Error ? err.message : tErr('serverError') }
  }
}

export async function saveKillbotSettings(
  input: SaveKillbotConfigInput,
): Promise<{ state?: KillbotAdminState; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const guildId = await requireKillbotManager()
    const db = getAdminClient()
    await saveKillbotConfig(db, guildId, input)
    const state = await loadKillbotAdminState(db, guildId)
    revalidatePath('/admin/dashboard/killbot')
    return { state }
  } catch (err) {
    return { error: err instanceof Error ? err.message : tErr('serverError') }
  }
}

export async function sendKillbotTest(): Promise<{ ok?: boolean; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const guildId = await requireKillbotManager()
    await sendKillbotTestMessage(getAdminClient(), guildId)
    revalidatePath('/admin/dashboard/killbot')
    return { ok: true }
  } catch (err) {
    return { error: err instanceof Error ? err.message : tErr('serverError') }
  }
}
