import 'server-only'

import { getTranslations } from 'next-intl/server'
import { log } from '@/lib/log'

export type PublicActionMessage =
  | 'actionFailed'
  | 'invalidInput'
  | 'notFound'
  | 'unauthorized'

export async function publicActionMessage(
  key: PublicActionMessage,
): Promise<string> {
  const t = await getTranslations('errors')
  return t(key)
}

/**
 * Record an unexpected Server Action failure without returning backend details
 * (SQL, relation names, constraint names, or provider messages) to the client.
 */
export async function publicActionError(
  error: unknown,
  action: string,
): Promise<string> {
  if (error instanceof Error && error.message === 'Unauthorized') {
    return publicActionMessage('unauthorized')
  }
  if (error instanceof Error && error.message === 'Event not found') {
    return publicActionMessage('notFound')
  }
  log.error('[server-action] unexpected failure', error, { action })
  const t = await getTranslations('errors')
  return t('actionFailed')
}
