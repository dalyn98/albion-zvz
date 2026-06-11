import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '219_tactics_board.sql'),
  'utf8',
)
const guidanceMigrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '220_tactic_step_guidance.sql'),
  'utf8',
)
const nextStepMigrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '221_tactic_step_next_links.sql'),
  'utf8',
)

describe('tactics migration tenant and share-link invariants', () => {
  it('keeps step and share rows scoped to the same guild as their board', () => {
    expect(migrationSql).toContain('unique (guild_id, id)')
    expect(migrationSql).toContain('foreign key (guild_id, board_id)')
    expect(migrationSql).toContain('references public.tactic_boards(guild_id, id)')
    expect(migrationSql).toContain('unique (guild_id, board_id, step_order)')
  })

  it('stores only hashed share tokens behind service-role RLS', () => {
    expect(migrationSql).toContain('token_hash text not null unique')
    expect(migrationSql).toContain("token_hash ~ '^[a-f0-9]{64}$'")
    expect(migrationSql).toContain('alter table public.tactic_share_links enable row level security')
    expect(migrationSql).toContain('grant select, insert, update, delete on public.tactic_share_links to service_role')
  })

  it('adds bounded conditional guidance without weakening tenant scoping', () => {
    expect(guidanceMigrationSql).toContain('alter table public.tactic_steps')
    expect(guidanceMigrationSql).toContain("phase text not null default 'setup'")
    expect(guidanceMigrationSql).toContain("danger_signs jsonb not null default '[]'::jsonb")
    expect(guidanceMigrationSql).toContain("common_mistakes jsonb not null default '[]'::jsonb")
    expect(guidanceMigrationSql).toContain("decision_branches jsonb not null default '[]'::jsonb")
    expect(guidanceMigrationSql).toContain('tactic_steps_phase_check')
    expect(guidanceMigrationSql).toContain('tactic_steps_danger_signs_array')
    expect(guidanceMigrationSql).toContain('tactic_steps_decision_branches_array')
    expect(guidanceMigrationSql).not.toContain('drop constraint')
    expect(guidanceMigrationSql).not.toContain('drop column guild_id')
  })

  it('adds bounded next-step transition links without weakening tenant scoping', () => {
    expect(nextStepMigrationSql).toContain('alter table public.tactic_steps')
    expect(nextStepMigrationSql).toContain("next_step_links jsonb not null default '[]'::jsonb")
    expect(nextStepMigrationSql).toContain('tactic_steps_next_step_links_array')
    expect(nextStepMigrationSql).not.toContain('drop constraint')
    expect(nextStepMigrationSql).not.toContain('drop column guild_id')
  })
})
