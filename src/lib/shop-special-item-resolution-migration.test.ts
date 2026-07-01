import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationSql = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '236_shop_special_item_resolution_backfill.sql'),
  'utf8',
)

describe('shop special item resolution migration', () => {
  it('maps special raw shop log names to canonical Albion unique names', () => {
    expect(migrationSql).toContain("'유령의 박쥐', 'UNIQUE_MOUNT_BAT_PERSONAL'")
    expect(migrationSql).toContain("'실버 방랑하는 요새', 'UNIQUE_MOUNT_BASTION_SILVER'")
    expect(migrationSql).toContain("'크리스탈 방랑하는 요새', 'UNIQUE_MOUNT_BASTION_CRYSTAL'")
    expect(migrationSql).toContain("'골드 방랑하는 요새', 'UNIQUE_MOUNT_BASTION_GOLD'")
    expect(migrationSql).toContain("'모르가나의 까마귀', 'UNIQUE_MOUNT_MORGANA_RAVEN_ADC'")
    expect(migrationSql).toContain("'블랙 팬서', 'UNIQUE_MOUNT_BLACK_PANTHER_ADC'")
    expect(migrationSql).toContain("'은신처 건설키트', 'UNIQUE_HIDEOUT'")
  })

  it('updates unresolved logs and applies only current-epoch inventory deltas in log order', () => {
    expect(migrationSql).toMatch(/update\s+public\.shop_chest_logs[\s\S]*set\s+unique_name\s*=\s*f\.unique_name/i)
    expect(migrationSql).toMatch(/b\.status\s*=\s*'confirmed'/i)
    expect(migrationSql).toMatch(/l\.logged_at\s*>\s*b\.baseline_at/i)
    expect(migrationSql).toContain('from public.shop_blacklist bl')
    expect(migrationSql).toMatch(/order\s+by\s+logged_at\s+asc,[\s\S]*imported_at\s+asc,[\s\S]*import_sequence\s+asc/i)
    expect(migrationSql).toMatch(/perform\s+public\.apply_shop_stock_delta[\s\S]*v_delta\.enchant/i)
  })
})
