import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../supabase/migrations/289_recent_gameplay_video_exchange_gate.sql', import.meta.url),
  'utf8',
)

describe('recent gameplay video exchange gate migration contract', () => {
  it('keeps the upload ledger tenant-scoped and service-role only', () => {
    expect(migration).toMatch(/unique\s*\(\s*guild_id\s*,\s*youtube_video_id\s*\)/i)
    expect(migration).toMatch(
      /foreign key\s*\(\s*guild_id\s*,\s*discord_id\s*\)[\s\S]*references public\.guild_avatars/i,
    )
    expect(migration).toMatch(
      /alter table public\.member_gameplay_video_uploads enable row level security/i,
    )
    expect(migration).toMatch(
      /revoke all on public\.member_gameplay_video_uploads from anon, authenticated/i,
    )
  })

  it('requires a non-invalidated upload from the preceding five days', () => {
    expect(migration).toMatch(
      /upload\.status\s*=\s*'submitted'[\s\S]*upload\.uploaded_at\s*>=\s*now\(\)\s*-\s*interval\s*'5 days'/i,
    )
    expect(migration).toMatch(/EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED/i)
    expect(migration).toMatch(
      /create trigger exchange_requests_member_restriction_guard[\s\S]*before insert on public\.exchange_requests/i,
    )
  })

  it('mirrors participation submissions and invalidates rejected videos', () => {
    expect(migration).toMatch(
      /create trigger alliance_content_video_submissions_gameplay_ledger/i,
    )
    expect(migration).toMatch(
      /case when new\.status = 'rejected' then 'invalidated' else 'submitted' end/i,
    )
  })

  it('preserves uploads and their source ownership through account merges', () => {
    expect(migration).toMatch(
      /update public\.alliance_content_video_submissions[\s\S]*set discord_id = p_to_discord_id/i,
    )
    expect(migration).toMatch(
      /update public\.member_gameplay_video_uploads[\s\S]*set discord_id = p_to_discord_id/i,
    )
    expect(migration).toMatch(
      /preview_member_account_merge_before_gameplay_videos/i,
    )
  })
})
