import 'server-only'

import type { getAdminClient } from '@/lib/supabase-admin'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

const SCREENSHOT_BUCKET = 'regear-screenshots'
const RETENTION_HOURS = 48
const BATCH_LIMIT = 500

export interface RegearScreenshotCleanupResult {
  deleted: number
  cutoff: string
}

export async function cleanupResolvedRegearScreenshots(
  db: SupabaseAdminClient,
  now = new Date(),
): Promise<RegearScreenshotCleanupResult> {
  const cutoff = new Date(
    now.getTime() - RETENTION_HOURS * 60 * 60 * 1000,
  ).toISOString()
  const { data: supportedRows, error: supportedError } = await db
    .from('app_settings')
    .select('guild_id')
    .eq('key', 'regear_support_enabled')
    .eq('value', 'true')
  if (supportedError) throw new Error(supportedError.message)

  const supportedGuildIds = Array.from(
    new Set((supportedRows ?? []).map((row) => row.guild_id as string)),
  )
  if (supportedGuildIds.length === 0) return { deleted: 0, cutoff }

  const { data: rows, error: selectError } = await db
    .from('regear_requests')
    .select('id, screenshot_path, screenshot_path_2')
    .in('guild_id', supportedGuildIds)
    .in('status', ['approved', 'rejected'])
    .lt('resolved_at', cutoff)
    .or('screenshot_path.not.is.null,screenshot_path_2.not.is.null')
    .limit(BATCH_LIMIT)
  if (selectError) throw new Error(selectError.message)

  const targets = (rows ?? []).filter(
    (row) =>
      (typeof row.screenshot_path === 'string' && row.screenshot_path.length > 0) ||
      (typeof row.screenshot_path_2 === 'string' && row.screenshot_path_2.length > 0),
  )
  if (targets.length === 0) return { deleted: 0, cutoff }

  const paths = targets.flatMap((row) => [
    ...(typeof row.screenshot_path === 'string' && row.screenshot_path.length > 0
      ? [row.screenshot_path]
      : []),
    ...(typeof row.screenshot_path_2 === 'string' && row.screenshot_path_2.length > 0
      ? [row.screenshot_path_2]
      : []),
  ])
  const { error: removeError } = await db.storage
    .from(SCREENSHOT_BUCKET)
    .remove(paths)
  if (removeError) throw new Error(removeError.message)

  const { error: updateError } = await db
    .from('regear_requests')
    .update({ screenshot_path: null, screenshot_path_2: null })
    .in('id', targets.map((row) => row.id))
  if (updateError) throw new Error(updateError.message)

  return { deleted: paths.length, cutoff }
}
