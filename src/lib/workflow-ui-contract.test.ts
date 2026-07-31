import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('preview and bulk workflow UI contracts', () => {
  it('requires the current siphon input to match its preview before commit', () => {
    const form = source('src/app/(app-shell)/admin/dashboard/siphon/SiphonImportForm.tsx')
    expect(form).toContain('createPreviewSnapshot')
    expect(form).toContain('isPreviewSnapshotCurrent')
    expect(form).toMatch(/disabled=\{[^}]*!previewIsCurrent/)
  })

  it('requires the current loot inputs to match their preview before save', () => {
    const form = source('src/app/(app-shell)/admin/dashboard/loot-audit/LootAuditForm.tsx')
    expect(form).toContain('createPreviewSnapshot')
    expect(form).toContain('isPreviewSnapshotCurrent')
    expect(form).toMatch(/disabled=\{[^}]*!previewIsCurrent/)
  })

  it('reconciles craft selections with visible task ids before bulk actions', () => {
    const queue = source('src/components/CraftQueueClient.tsx')
    expect(queue).toContain('reconcileSelectionWithVisible')
    expect(queue).toContain('visibleSelectedQueued')
    expect(queue).toContain('visibleSelectedMine')
    expect(queue).toMatch(/bulkClaimCraftQueueItems\(\s*\[\.\.\.visibleSelectedQueued\]/)
    expect(queue).toMatch(/bulkReleaseCraftQueueItems\(\s*\[\.\.\.visibleSelectedMine\]/)
  })
})
