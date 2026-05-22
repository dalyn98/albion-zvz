import { getAdminClient } from '@/lib/supabase-admin'
import { log } from '@/lib/log'
import {
  isMissingAccountAlbionTable,
  refreshMemberAlbionIdentity,
} from '@/lib/account-albion-identity'

const DEFAULT_BATCH_SIZE = 100
const ONE_DAY_MS = 24 * 60 * 60 * 1000

export interface AccountAlbionSyncResult {
  scanned: number
  refreshed: number
  failed: number
  skipped: number
}

export type AccountAlbionSyncOutcome =
  | { kind: 'ok'; result: AccountAlbionSyncResult }
  | { kind: 'skipped'; reason: string }
  | { kind: 'error'; message: string }

export async function runAccountAlbionSync(
  tenantId: string,
  opts: { batchSize?: number; now?: Date } = {},
): Promise<AccountAlbionSyncOutcome> {
  const db = getAdminClient()
  const now = opts.now ?? new Date()
  const cutoffIso = new Date(now.getTime() - ONE_DAY_MS).toISOString()
  const batchSize = Math.max(1, Math.min(opts.batchSize ?? DEFAULT_BATCH_SIZE, 250))

  const { data, error } = await db
    .from('account_albion_tenant_links')
    .select('discord_id, last_synced_at')
    .eq('guild_id', tenantId)
    .not('albion_player_id', 'is', null)
    .neq('trust_status', 'revoked')
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoffIso}`)
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(batchSize)

  if (isMissingAccountAlbionTable(error)) return { kind: 'skipped', reason: 'account_tables_missing' }
  if (error) return { kind: 'error', message: error.message }

  const rows = data ?? []
  let refreshed = 0
  let failed = 0
  let skipped = 0

  for (const row of rows) {
    const discordId = row.discord_id as string | null
    if (!discordId) {
      skipped += 1
      continue
    }
    const result = await refreshMemberAlbionIdentity(tenantId, discordId, { manual: false })
    if (result.ok) {
      refreshed += 1
      continue
    }
    failed += 1
    log.warn('[account-albion-sync] refresh failed', {
      guild_id: tenantId,
      discord_id: discordId,
      error: result.error ?? 'unknown',
    })
  }

  return {
    kind: 'ok',
    result: {
      scanned: rows.length,
      refreshed,
      failed,
      skipped,
    },
  }
}
