import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/373_public_zvz_v2_season_boundaries.sql', import.meta.url),
  'utf8',
)
const reconciliation = readFileSync(
  new URL('../../supabase/migrations/374_public_zvz_v2_projection_backfill.sql', import.meta.url),
  'utf8',
)
const superAdminActions = readFileSync(
  new URL('../app/super-admin/actions.ts', import.meta.url),
  'utf8',
)
const backfillOrder = readFileSync(
  new URL('../../supabase/migrations/375_public_zvz_backfill_order.sql', import.meta.url),
  'utf8',
)
const candidateFilter = readFileSync(
  new URL('../../supabase/migrations/376_public_zvz_candidate_backfill_filter.sql', import.meta.url),
  'utf8',
)
const candidateQuery = readFileSync(
  new URL('../../supabase/migrations/377_public_zvz_candidate_backfill_query.sql', import.meta.url),
  'utf8',
)
const coarsePrefilter = readFileSync(
  new URL('../../supabase/migrations/378_public_zvz_backfill_coarse_prefilter.sql', import.meta.url),
  'utf8',
)
const perServerScan = readFileSync(
  new URL('../../supabase/migrations/379_public_zvz_backfill_per_server_scan.sql', import.meta.url),
  'utf8',
)

describe('public ZvZ v2 season boundary migration', () => {
  it('invalidates both snapshot generations and exposes a service-only rebuild RPC', () => {
    expect(migration).toContain('trg_invalidate_public_zvz_season_snapshots')
    expect(migration).toContain('delete from public.zvz_season_snapshots')
    expect(migration).toContain('delete from public.public_zvz_v2_season_snapshots')
    expect(migration).toContain('refresh_all_public_zvz_v2_season_snapshots')
    expect(migration).toContain('to service_role')
    expect(migration).toContain('from public, anon, authenticated')
    expect(superAdminActions).toContain('refresh_all_public_zvz_v2_season_snapshots')
  })

  it('reconciles the production backfill and v2 entity-search RPCs additively', () => {
    expect(reconciliation).toContain('list_public_zvz_projection_backfill_candidates')
    expect(reconciliation).toContain('public_zvz_battle_projection_runs')
    expect(reconciliation).toContain('create or replace function public.search_public_zvz_entities')
    expect(reconciliation).toContain('public_zvz_v2_season_rollups')
    expect(reconciliation).toContain('to service_role')
    expect(backfillOrder).toContain('order by battle.started_at desc')
    expect(backfillOrder).toContain('list_public_zvz_projection_backfill_candidates')
    expect(candidateFilter).toContain('plausible_battles as materialized')
    expect(candidateFilter).toContain("home.force_level = 'alliance'")
    expect(candidateFilter).toContain('home.team_size >= 20')
    expect(candidateFilter).toContain('sum(opponent.team_size)')
    expect(candidateFilter).toContain('idx_battle_force_summaries_large_alliance_battle')
    expect(candidateFilter).toContain('to service_role')
    expect(candidateQuery).toContain('battle.total_players >= 40')
    expect(candidateQuery).toContain('idx_battle_records_zvz_candidate_started')
    expect(candidateQuery).toContain("home.force_level = 'alliance'")
    expect(candidateQuery).toContain('sum(opponent.team_size)')
    expect(candidateQuery).toContain('order by battle.started_at desc')
    expect(coarsePrefilter).toContain('battle.total_players >= 40')
    expect(coarsePrefilter).toContain('isPublicZvzProjectionCandidate')
    expect(coarsePrefilter).not.toContain('from public.battle_force_summaries')
    expect(coarsePrefilter).toContain('order by battle.started_at desc')
    expect(perServerScan).toContain('cross join lateral')
    expect(perServerScan).toContain('not exists')
    expect(perServerScan).toContain('run.coverage = \'complete\'')
    expect(perServerScan).toContain('order by battle.started_at desc')
    expect(perServerScan).toContain('isPublicZvzProjectionCandidate')
  })
})
