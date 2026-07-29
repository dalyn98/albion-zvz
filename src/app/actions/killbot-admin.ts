'use server'


import { publicActionError } from '@/lib/public-action-error'
import { revalidatePath } from 'next/cache'
import { sessionHasAny } from '@/lib/session'
import { requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { CAP } from '@/lib/permissions'
import {
  loadKillbotAdminState,
  saveKillbotConfig,
  sendKillbotTestMessage,
  type KillbotAdminState,
  type KillbotTestMessageKind,
  type SaveKillbotConfigInput,
} from '@/lib/killbot'

const KILLBOT_MANAGE_CAPS = [CAP.SETTINGS_GENERAL] as const

async function requireKillbotManager(): Promise<string> {
  const session = await requireLiveSession()
  if (!session.isAdmin && !sessionHasAny(session, KILLBOT_MANAGE_CAPS)) {
    throw new Error('Unauthorized')
  }
  return getSessionGuildId(session)
}

export async function getKillbotAdminState(): Promise<{
  state?: KillbotAdminState
  error?: string
}> {
  try {
    const guildId = await requireKillbotManager()
    const state = await loadKillbotAdminState(getAdminClient(), guildId)
    return { state }
  } catch (err) {
    return { error: await publicActionError(err, 'actions/killbot-admin') }
  }
}

export async function saveKillbotSettings(
  input: SaveKillbotConfigInput,
): Promise<{ state?: KillbotAdminState; error?: string }> {
  try {
    const guildId = await requireKillbotManager()
    const db = getAdminClient()
    await saveKillbotConfig(db, guildId, input)
    const state = await loadKillbotAdminState(db, guildId)
    revalidatePath('/admin/dashboard/killbot')
    return { state }
  } catch (err) {
    return { error: await publicActionError(err, 'actions/killbot-admin') }
  }
}

export async function sendKillbotTest(
  kind?: KillbotTestMessageKind,
  draftConfig?: SaveKillbotConfigInput,
): Promise<{ ok?: boolean; error?: string }> {
  try {
    const guildId = await requireKillbotManager()
    await sendKillbotTestMessage(
      getAdminClient(),
      guildId,
      kind ? { kind, configOverride: draftConfig } : undefined,
    )
    revalidatePath('/admin/dashboard/killbot')
    return { ok: true }
  } catch (err) {
    return { error: await publicActionError(err, 'actions/killbot-admin') }
  }
}
