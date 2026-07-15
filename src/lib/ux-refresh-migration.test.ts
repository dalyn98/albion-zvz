import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/259_menhera_ux_refresh_v2.sql'),
  'utf8',
)

describe('Menhera UX refresh migration', () => {
  it('enables the tenant feature flag only for Menhera', () => {
    expect(sql).toMatch(/insert\s+into\s+public\.app_settings/i)
    expect(sql).toMatch(/ux_refresh_v2_enabled/i)
    expect(sql).toMatch(/where\s+t\.slug\s*=\s*'menhera'/i)
    expect(sql).toMatch(/on\s+conflict\s*\(guild_id,\s*key\)/i)
  })

  it('stores privacy-safe UX events under tenant isolation', () => {
    expect(sql).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.ux_events/i)
    expect(sql).toMatch(/guild_id\s+uuid\s+not\s+null/i)
    expect(sql).toMatch(/flow_id\s+uuid\s+not\s+null/i)
    expect(sql).toMatch(/enable\s+row\s+level\s+security/i)
    expect(sql).toMatch(/create\s+index[\s\S]*guild_id[\s\S]*created_at\s+desc/i)
    expect(sql).not.toMatch(/discord_id|username|notes|free_text/i)
  })
})
