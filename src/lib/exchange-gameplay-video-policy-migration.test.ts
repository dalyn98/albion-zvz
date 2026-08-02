import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/344_exchange_recent_gameplay_video_policy_toggle.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('exchange gameplay-video policy toggle migration', () => {
  it('keeps the existing video requirement on by default', () => {
    expect(migration).toMatch(
      /coalesce\([\s\S]*setting\.value\s*<>\s*'false'[\s\S]*,\s*true\)/i,
    )
  })

  it('applies the toggle only to the video gate and preserves manual restrictions', () => {
    expect(migration).toMatch(/EXCHANGE_TEMPORARILY_RESTRICTED/i)
    expect(migration).toMatch(
      /setting\.guild_id\s*=\s*new\.guild_id[\s\S]*setting\.key\s*=\s*'exchange_recent_gameplay_video_required'/i,
    )
    expect(migration).toMatch(
      /exchange_recent_gameplay_video_required'[\s\S]*EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED/i,
    )
  })
})
