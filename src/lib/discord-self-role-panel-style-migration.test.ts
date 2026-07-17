import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase/migrations/269_menhera_discord_self_role_panel_styles.sql'),
  'utf8',
)

describe('Menhera Discord self-role panel style migration', () => {
  it('updates only the Menhera tenant with English panel copy', () => {
    expect(migrationSql).toMatch(/discord_self_role_panel_config/i)
    expect(migrationSql).toMatch(/where\s+t\.slug\s*=\s*'menhera'/i)
    expect(migrationSql).toContain('Basic Role Selection')
    expect(migrationSql).toContain('Click a button below to receive a role.')
  })

  it.each([
    ['1525586411787387051', 'DPS_Basic', 4],
    ['1525586931079974962', 'Tank_Basic', 1],
    ['1525587064496717844', 'Sup_Basic', 2],
    ['1525587169396396223', 'Heal_Basic', 3],
  ])('sets role %s (%s) to Discord button style %i', (roleId, label, style) => {
    expect(migrationSql).toContain(
      `jsonb_build_object('id', '${roleId}', 'label', '${label}', 'style', ${style})`,
    )
  })
})
