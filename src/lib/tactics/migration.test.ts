import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '219_tactics_board.sql'),
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
})
