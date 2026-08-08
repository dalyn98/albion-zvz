import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const schemaSql = readFileSync(
  new URL(
    '../../supabase/migrations/347_event_participation_auto_closeout.sql',
    import.meta.url,
  ),
  'utf8',
)
const rolloutSql = readFileSync(
  new URL(
    '../../supabase/migrations/348_rollout_event_participation_auto_closeout.sql',
    import.meta.url,
  ),
  'utf8',
)
const configurableDelaySql = readFileSync(
  new URL(
    '../../supabase/migrations/363_configurable_event_participation_auto_closeout.sql',
    import.meta.url,
  ),
  'utf8',
)
const tenantModeSql = readFileSync(
  new URL(
    '../../supabase/migrations/409_tenant_event_participation_closeout_mode.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('event participation automatic closeout migration contract', () => {
  it('waits six hours, locks due events, and uses the existing atomic closeout', () => {
    expect(schemaSql).toMatch(
      /review_started_at[\s\S]*interval '6 hours'[\s\S]*for update of event skip locked/i,
    )
    expect(schemaSql).toMatch(
      /public\.finalize_event_participation_closeout\([\s\S]*v_event\.id,[\s\S]*0,[\s\S]*v_entries/i,
    )
  })

  it('uses only the exact assigned-slot roster and never promotes activity evidence', () => {
    expect(schemaSql).toMatch(
      /from public\.slots as slot[\s\S]*join public\.parties as party[\s\S]*assigned_discord_id/i,
    )
    expect(schemaSql).toContain("'evidenceStatus', 'not_checked'")
    expect(schemaSql).not.toMatch(/battle_particip|killboard/i)
  })

  it('keeps commands service-only and records pause/resume audits', () => {
    expect(schemaSql).toMatch(
      /set_event_participation_auto_closeout_paused[\s\S]*event\.participation\.auto_closeout\.pause[\s\S]*event\.participation\.auto_closeout\.resume/i,
    )
    expect(schemaSql).toMatch(
      /revoke all on function public\.finalize_due_event_participation_closeouts[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i,
    )
  })

  it('gives recently ended events a fresh review period instead of closing immediately', () => {
    expect(rolloutSql).toMatch(
      /greatest\([\s\S]*operational_ended_at[\s\S]*statement_timestamp\(\)[\s\S]*interval '24 hours'/i,
    )
    expect(rolloutSql).toMatch(
      /not exists \([\s\S]*event_participation_closeouts[\s\S]*not exists \([\s\S]*event_payout_requests/i,
    )
  })

  it('snapshots a bounded tenant delay and uses it for every deadline', () => {
    expect(configurableDelaySql).toMatch(
      /participation_auto_closeout_delay_hours[\s\S]*between 1 and 72/i,
    )
    expect(configurableDelaySql).toMatch(
      /app_settings[\s\S]*event_participation_auto_closeout_hours[\s\S]*new\.participation_auto_closeout_delay_hours/i,
    )
    expect(configurableDelaySql).toMatch(
      /review_started_at[\s\S]*make_interval\(hours => event\.participation_auto_closeout_delay_hours\)[\s\S]*clock_timestamp\(\)/i,
    )
    expect(configurableDelaySql).toMatch(
      /'delayHours', v_event\.participation_auto_closeout_delay_hours[\s\S]*'dueAt', v_due_at/i,
    )
  })

  it('snapshots the tenant automatic or manual mode only when an event is inserted', () => {
    expect(tenantModeSql).toMatch(
      /tg_op = 'INSERT'[\s\S]*setting\.guild_id = new\.guild_id[\s\S]*event_participation_auto_closeout_enabled/i,
    )
    expect(tenantModeSql).toMatch(
      /v_auto_closeout_enabled = 'true'[\s\S]*new\.participation_auto_closeout_enabled := true[\s\S]*v_auto_closeout_enabled = 'false'[\s\S]*new\.participation_auto_closeout_enabled := false/i,
    )
    expect(tenantModeSql).toMatch(
      /if not new\.participation_auto_closeout_enabled[\s\S]*review_started_at := null[\s\S]*return new/i,
    )
  })
})
