'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { logAdminAction } from '@/lib/admin-audit'
import { requireEventCreatorForEvent } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'

interface ActionResult {
  error?: string
}

interface AssignEventTacticInput {
  eventId: string
  boardId: string
}

function revalidateEventOperations(eventId: string): void {
  revalidatePath(`/admin/dashboard/events/${eventId}`)
  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/events/${eventId}/tactic`)
  revalidatePath(`/events/${eventId}/report`)
}

function operationErrorKey(message: string):
  | 'unauthorized'
  | 'eventNotFound'
  | 'tacticLocked'
  | 'tacticNotPublished'
  | 'tacticHasNoSteps'
  | 'tacticNotCombat'
  | 'serverError' {
  if (message.includes('Unauthorized')) return 'unauthorized'
  if (message.includes('event_not_found') || message.includes('Event not found')) {
    return 'eventNotFound'
  }
  if (message.includes('event_tactic_snapshot_locked')) return 'tacticLocked'
  if (message.includes('published_tactic_not_found')) return 'tacticNotPublished'
  if (message.includes('published_tactic_has_no_steps')) return 'tacticHasNoSteps'
  if (message.includes('event_tactic_not_combat')) return 'tacticNotCombat'
  return 'serverError'
}

export async function assignEventTactic(
  input: AssignEventTacticInput,
): Promise<ActionResult & { snapshotId?: string }> {
  const t = await getTranslations('eventOperations')
  try {
    const session = await getSession()
    if (!session) return { error: t('unauthorized') }
    if (!input.eventId || !input.boardId) return { error: t('tacticRequired') }
    const db = await requireEventCreatorForEvent(input.eventId)
    const guildId = await getSessionGuildId(session)
    const { data, error } = await db.rpc('capture_event_tactic_snapshot', {
      p_guild_id: guildId,
      p_event_id: input.eventId,
      p_board_id: input.boardId,
      p_actor: session.discordId,
    })
    if (error) return { error: t(operationErrorKey(error.message)) }

    const snapshotId = data as string
    revalidateEventOperations(input.eventId)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.update',
      targetId: input.eventId,
      targetKind: 'event',
      details: {
        kind: 'tactic_snapshot_assign',
        boardId: input.boardId,
        snapshotId,
      },
    })
    return { snapshotId }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return { error: t(operationErrorKey(message)) }
  }
}

export async function clearEventTactic(eventId: string): Promise<ActionResult> {
  const t = await getTranslations('eventOperations')
  try {
    const session = await getSession()
    if (!session) return { error: t('unauthorized') }
    const db = await requireEventCreatorForEvent(eventId)
    const guildId = await getSessionGuildId(session)
    const { error } = await db.rpc('clear_event_tactic_snapshot', {
      p_guild_id: guildId,
      p_event_id: eventId,
    })
    if (error) return { error: t(operationErrorKey(error.message)) }

    revalidateEventOperations(eventId)
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'event.update',
      targetId: eventId,
      targetKind: 'event',
      details: { kind: 'tactic_snapshot_clear' },
    })
    return {}
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    return { error: t(operationErrorKey(message)) }
  }
}
