import 'server-only'

import { unstable_cache } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { resolveTenantBySlug, type ResolvedTenant } from '@/lib/tenant-resolver'
import { selectPagedRowsOrThrow } from '@/lib/supabase-pagination'
import { getAppSetting } from '@/lib/app-settings'
import {
  buildPublicBattleGroupReport,
  normalizePublicBattleGroupParams,
  type PublicBattleEventRow,
  type PublicBattleGroupParamError,
  type PublicBattleGroupParams,
  type PublicBattleGroupReport,
  type PublicBattleRecordRow,
} from '@/lib/public-battle-report-model'

export type {
  PublicBattleGroupBattle,
  PublicBattleGroupEventLine,
  PublicBattleGroupForceLine,
  PublicBattleGroupPlayerLine,
  PublicBattleGroupReport,
} from '@/lib/public-battle-report-model'

export type PublicBattleGroupLoadError =
  | PublicBattleGroupParamError
  | 'tenant_not_found'
  | 'no_tracked_battles'

export type PublicBattleGroupLoadResult =
  | {
      ok: true
      tenant: ResolvedTenant
      params: PublicBattleGroupParams
      report: PublicBattleGroupReport
    }
  | {
      ok: false
      error: PublicBattleGroupLoadError
      params?: PublicBattleGroupParams
      tenant?: ResolvedTenant
    }

async function loadPublicBattleGroupReportUncached(input: {
  tenantSlug: string
  server?: string | string[] | null
  ids?: string | string[] | null
}): Promise<PublicBattleGroupLoadResult> {
  const normalized = normalizePublicBattleGroupParams({
    server: input.server,
    ids: input.ids,
  })
  if (!normalized.ok) return { ok: false, error: normalized.error }

  const tenant = await resolveTenantBySlug(input.tenantSlug)
  if (!tenant) return { ok: false, error: 'tenant_not_found', params: normalized.params }

  const db = getAdminClient()
  const [battleResult, homeGuildId, homeGuildName] = await Promise.all([
    db
      .from('battle_records')
      .select(
        'id, albion_battle_id, started_at, ended_at, total_players, total_kills, total_fame, cluster_name, raw_battle',
      )
      .eq('albion_server', normalized.params.server)
      .in('albion_battle_id', normalized.params.ids),
    getAppSetting('albion_home_guild_id', '', tenant.tenantId),
    getAppSetting('albion_home_guild_name', '', tenant.tenantId),
  ])

  if (battleResult.error) {
    throw new Error(`public battle records query failed: ${battleResult.error.message}`)
  }
  const battleRows = (battleResult.data ?? []) as PublicBattleRecordRow[]

  const eventRows =
    normalized.params.ids.length > 0
      ? await selectPagedRowsOrThrow<PublicBattleEventRow>({
          label: 'public battle killboard events',
          buildQuery: () =>
            db
              .from('killboard_events')
              .select('event_id, battle_id, role, player_name, fame, occurred_at')
              .eq('guild_id', tenant.tenantId)
              .in('battle_id', normalized.params.ids)
              .order('occurred_at', { ascending: true }),
        })
      : []

  const report = buildPublicBattleGroupReport({
    server: normalized.params.server,
    requestedBattleIds: normalized.params.ids,
    battleRows,
    eventRows,
    highlightGuildId: homeGuildId,
    highlightGuildName: homeGuildName,
  })
  if (!report) {
    return {
      ok: false,
      error: 'no_tracked_battles',
      params: normalized.params,
      tenant,
    }
  }

  return {
    ok: true,
    tenant,
    params: normalized.params,
    report,
  }
}

export const loadPublicBattleGroupReport = unstable_cache(
  loadPublicBattleGroupReportUncached,
  ['public-battle-group-report-v3'],
  { revalidate: 60 },
)
