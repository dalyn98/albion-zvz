import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const schemaSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/263_menhera_ux_refresh_v2.sql'),
  'utf8',
)
const rolloutSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/264_enable_menhera_ux_refresh_v2.sql'),
  'utf8',
)

describe('Menhera UX refresh migration', () => {
  it('enables the tenant feature flag only for Menhera', () => {
    expect(rolloutSql).toMatch(/insert\s+into\s+public\.app_settings/i)
    expect(rolloutSql).toMatch(/ux_refresh_v2_enabled/i)
    expect(rolloutSql).toMatch(/where\s+t\.slug\s*=\s*'menhera'/i)
    expect(rolloutSql).toMatch(/on\s+conflict\s*\(guild_id,\s*key\)/i)
    expect(schemaSql).not.toMatch(/insert\s+into\s+public\.app_settings/i)
  })

  it('stores privacy-safe UX events under tenant isolation', () => {
    expect(schemaSql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.ux_events/i)
    expect(schemaSql).toMatch(/guild_id\s+uuid\s+not\s+null/i)
    expect(schemaSql).toMatch(/flow_id\s+uuid\s+not\s+null/i)
    expect(schemaSql).toMatch(/enable\s+row\s+level\s+security/i)
    expect(schemaSql).toMatch(/create\s+index[\s\S]*guild_id[\s\S]*created_at\s+desc/i)
    expect(schemaSql).not.toMatch(/discord_id|username|notes|free_text/i)
  })
})
