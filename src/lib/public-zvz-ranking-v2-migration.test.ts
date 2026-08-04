import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/372_public_zvz_engagement_rankings_v2.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('public ZvZ engagement rankings v2 migration', () => {
  it('stores canonical engagements, proportional entity evidence, and independent snapshots', () => {
    for (const table of [
      'public_zvz_engagements',
      'public_zvz_engagement_matchups',
      'public_zvz_entity_engagement_evidence',
      'public_zvz_battle_projection_runs',
      'public_zvz_v2_season_snapshots',
      'public_zvz_v2_season_evidence',
      'public_zvz_v2_season_rollups',
    ]) {
      expect(migration).toContain(`create table public.${table}`)
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`revoke all on public.${table} from anon, authenticated`)
    }
    expect(migration).toContain('abs(battle_points - battle_credit * 25)')
    expect(migration).toContain("entity_kind in ('guild', 'alliance')")
    expect(migration).toContain("scope in ('overall', 'small', 'mid', 'large', 'zerg')")
  })

  it('keeps writes transactional and service-role-only', () => {
    expect(migration).toContain('replace_public_zvz_battle_projection')
    expect(migration).toContain('for update')
    expect(migration).toContain('stale battle projection source')
    expect(migration).toMatch(
      /revoke all on function public\.replace_public_zvz_battle_projection[\s\S]*from public, anon, authenticated/i,
    )
    expect(migration).toContain('list_public_zvz_projection_backfill_candidates')
  })

  it('mirrors the agreed overall and scale-specific formulas', () => {
    expect(migration).toContain('ordered.size_order <= 3')
    expect(migration).toContain('least(500::numeric, enriched.representative_size * 5)')
    expect(migration).toContain('350::numeric * enriched.combat_index')
    expect(migration).toContain('700::numeric * enriched.combat_index')
    expect(migration).toContain('150::numeric * least')
    expect(migration).toContain('300::numeric * least')
    expect(migration).toContain('ln(1 + enriched.equivalent_battles) / ln(11::numeric)')
    expect(migration).toMatch(
      /cross join lateral \([\s\S]*values \('overall'::text\), \(evidence\.scale\)/i,
    )
  })

  it('freezes only finalized complete 20-v-20 engagement evidence', () => {
    expect(migration).toContain("engagement.status = 'final'")
    expect(migration).toContain("status <> 'final' or (coverage = 'complete'")
    expect(migration).toContain('home_side_team_size >= 20 and opponent_side_team_size >= 20')
    expect(migration).toContain("clock_timestamp() - interval '48 hours'")
  })
})
