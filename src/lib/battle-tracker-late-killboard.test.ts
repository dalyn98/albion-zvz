import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(
  join(process.cwd(), 'src/app/api/cron/battle-tracker/route.ts'),
  'utf8',
)

describe('battle tracker delayed killboard recovery', () => {
  it('finds newly ingested killboard hints by database creation time', () => {
    expect(routeSource).toMatch(
      /from\('killboard_events'\)[\s\S]*?\.gte\('created_at', sinceIso\)/,
    )
  })

  it('retains a fresh provisional row before deleting unmatched battles', () => {
    const retentionCheck = routeSource.indexOf('shouldRetainProvisionalMatchup({')
    const tenantRowDelete = routeSource.indexOf(".from('tenant_battle_records')", retentionCheck)

    expect(retentionCheck).toBeGreaterThan(-1)
    expect(tenantRowDelete).toBeGreaterThan(retentionCheck)
  })

  it('stores replacement final rows before deleting the provisional fallback', () => {
    const finalUpsert = routeSource.indexOf('.upsert(finalRows')
    const provisionalDelete = routeSource.indexOf(
      ".from('tenant_battle_records')",
      finalUpsert,
    )

    expect(finalUpsert).toBeGreaterThan(-1)
    expect(provisionalDelete).toBeGreaterThan(finalUpsert)
  })
})
