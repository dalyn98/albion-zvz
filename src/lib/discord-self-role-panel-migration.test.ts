import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/268_menhera_discord_self_role_panel.sql'),
  'utf8',
)
const interactionRoute = readFileSync(
  join(process.cwd(), 'src/app/api/discord/interactions/route.ts'),
  'utf8',
)

describe('Menhera Discord self-role panel migration', () => {
  it('seeds the panel config only for the Menhera tenant', () => {
    expect(migrationSql).toMatch(/insert\s+into\s+public\.app_settings/i)
    expect(migrationSql).toMatch(/discord_self_role_panel_config/i)
    expect(migrationSql).toMatch(/where\s+t\.slug\s*=\s*'menhera'/i)
    expect(migrationSql).toMatch(/on\s+conflict\s*\(guild_id,\s*key\)/i)
  })

  it.each([
    '1527633498054066196',
    '1525586411787387051',
    '1525586931079974962',
    '1525587064496717844',
    '1525587169396396223',
  ])('contains the requested Discord snowflake %s', (snowflake) => {
    expect(migrationSql).toContain(snowflake)
  })

  it('routes matching signed component interactions to the self-role handler', () => {
    expect(interactionRoute).toContain('isDiscordSelfRolePanelCustomId')
    expect(interactionRoute).toContain('handleDiscordSelfRolePanelInteraction')
    expect(interactionRoute).toMatch(/deferredEphemeralReply\(\)/)
  })
})
