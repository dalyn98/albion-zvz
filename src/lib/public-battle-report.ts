import 'server-only'

import { unstable_cache } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { resolveTenantBySlug, type ResolvedTenant } from '@/lib/tenant-resolver'
import { selectPagedRowsOrThrow } from '@/lib/supabase-pagination'
import {
  buildPublicBattleGroupReport,
  normalizePublicBattleGroupParams,
  type PublicBattleEventRow,
  type PublicBattleGroupParamError,
  type PublicBattleGroupParams,
  type PublicBattleGroupReport,
  type PublicBattleRecordRow,
  type PublicBattleTenantRow,
} from '@/lib/public-battle-report-model'

export type {
  PublicBattleGroupBattle,
  PublicBattleGroupEventLine,
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
  const { data: battleRowsRaw, error: battleErr } = await db
    .from('battle_records')
    .select(
      'id, albion_battle_id, started_at, ended_at, total_players, total_fame, cluster_name',
    )
    .eq('albion_server', normalized.params.server)
    .in('albion_battle_id', normalized.params.ids)

  if (battleErr) throw new Error(`public battle records query failed: ${battleErr.message}`)
  const battleRows = (battleRowsRaw ?? []) as PublicBattleRecordRow[]
  const battleRecordIds = battleRows.map((row) => row.id)

  const tenantRows =
    battleRecordIds.length > 0
      ? await selectPagedRowsOrThrow<PublicBattleTenantRow>({
          label: 'public battle tenant rows',
          buildQuery: () =>
            db
              .from('tenant_zvz_battle_records')
              .select(
                'id, battle_record_id, home_guild_name, home_team_size, home_kills, home_deaths, home_kill_fame, main_opponent_force_name, main_opponent_team_size, primary_opponent_name, opponent_team_size, started_at, outcome, is_provisional',
              )
              .eq('guild_id', tenant.tenantId)
              .in('battle_record_id', battleRecordIds),
        })
      : []

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
    tenantRows,
    eventRows,
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
  ['public-battle-group-report-v1'],
  { revalidate: 60 },
)
