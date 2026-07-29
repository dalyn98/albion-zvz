import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const gameplayVideoMigration = readFileSync(
  new URL('../../supabase/migrations/289_recent_gameplay_video_exchange_gate.sql', import.meta.url),
  'utf8',
)
const scopeMigration = readFileSync(
  new URL(
    '../../supabase/migrations/294_restore_menhera_content_compliance_scope.sql',
    import.meta.url,
  ),
  'utf8',
)
const participantCompatibilityMigration = readFileSync(
  new URL(
    '../../supabase/migrations/296_gameplay_video_participant_compatibility.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('recent gameplay video exchange gate migration contract', () => {
  it('keeps the upload ledger tenant-scoped and service-role only', () => {
    expect(gameplayVideoMigration).toMatch(
      /unique\s*\(\s*guild_id\s*,\s*youtube_video_id\s*\)/i,
    )
    expect(gameplayVideoMigration).toMatch(
      /foreign key\s*\(\s*guild_id\s*,\s*discord_id\s*\)[\s\S]*references public\.guild_avatars/i,
    )
    expect(gameplayVideoMigration).toMatch(
      /alter table public\.member_gameplay_video_uploads enable row level security/i,
    )
    expect(gameplayVideoMigration).toMatch(
      /revoke all on public\.member_gameplay_video_uploads from anon, authenticated/i,
    )
    expect(participantCompatibilityMigration).toContain(
      'drop constraint if exists',
    )
    expect(participantCompatibilityMigration).toContain(
      'member_gameplay_video_uploads_guild_id_discord_id_fkey',
    )
    expect(gameplayVideoMigration).toMatch(
      /submit_member_gameplay_video[\s\S]*from public\.guild_avatars[\s\S]*MEMBER_NOT_FOUND/i,
    )
  })

  it('requires a non-invalidated upload from the preceding five days', () => {
    expect(gameplayVideoMigration).toMatch(
      /upload\.status\s*=\s*'submitted'[\s\S]*upload\.uploaded_at\s*>=\s*now\(\)\s*-\s*interval\s*'5 days'/i,
    )
    expect(gameplayVideoMigration).toMatch(/EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED/i)
    expect(gameplayVideoMigration).toMatch(
      /create trigger exchange_requests_member_restriction_guard[\s\S]*before insert on public\.exchange_requests/i,
    )
  })

  it('uses the final Menhera-only resolver for video registration and exchange eligibility', () => {
    expect(gameplayVideoMigration).toMatch(
      /if not public\.alliance_content_compliance_enabled\(p_guild_id\)[\s\S]*MEMBER_GAMEPLAY_VIDEO_FEATURE_UNAVAILABLE/i,
    )
    expect(gameplayVideoMigration).toMatch(
      /if public\.alliance_content_compliance_enabled\(new\.guild_id\)[\s\S]*EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED/i,
    )
    expect(scopeMigration).toMatch(
      /where t\.id = p_guild_id[\s\S]*t\.slug\s*=\s*'menhera'/i,
    )
  })

  it('mirrors participation submissions and invalidates rejected videos', () => {
    expect(gameplayVideoMigration).toMatch(
      /create trigger alliance_content_video_submissions_gameplay_ledger/i,
    )
    expect(gameplayVideoMigration).toMatch(
      /case when new\.status = 'rejected' then 'invalidated' else 'submitted' end/i,
    )
  })

  it('preserves uploads and their source ownership through account merges', () => {
    expect(gameplayVideoMigration).toMatch(
      /update public\.alliance_content_video_submissions[\s\S]*set discord_id = p_to_discord_id/i,
    )
    expect(gameplayVideoMigration).toMatch(
      /update public\.member_gameplay_video_uploads[\s\S]*set discord_id = p_to_discord_id/i,
    )
    expect(gameplayVideoMigration).toMatch(
      /preview_member_account_merge_before_gameplay_videos/i,
    )
  })
})
