import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/290_gameplay_video_reflection_note.sql', import.meta.url),
  'utf8',
)

describe('gameplay video reflection migration contract', () => {
  it('adds a bounded optional note without changing existing rows', () => {
    expect(migration).toMatch(
      /add column if not exists reflection_note text/i,
    )
    expect(migration).toMatch(
      /reflection_note is null or char_length\(reflection_note\) <= 300/i,
    )
  })

  it('keeps the old RPC compatible and exposes the new overload only to service role', () => {
    expect(migration).toMatch(
      /submit_member_gameplay_video\(\s*p_guild_id uuid[\s\S]*p_reflection_note text/i,
    )
    expect(migration).toMatch(
      /revoke all on function public\.submit_member_gameplay_video\(uuid, text, text, text, text\)[\s\S]*from public, anon, authenticated/i,
    )
    expect(migration).toMatch(
      /grant execute on function public\.submit_member_gameplay_video\(uuid, text, text, text, text\)[\s\S]*to service_role/i,
    )
  })
})
