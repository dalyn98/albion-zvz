import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('operational preview UX', () => {
  it('sends killbot tests with the current unsaved draft without persisting it', () => {
    const client = source('src/app/(app-shell)/admin/dashboard/killbot/KillbotSettingsClient.tsx')
    const action = source('src/app/actions/killbot-admin.ts')
    const domain = source('src/lib/killbot.ts')

    expect(client).toContain('currentDraftConfig')
    expect(client).toContain('sendKillbotTest(kind, currentDraftConfig)')
    expect(action).toContain('draftConfig?: SaveKillbotConfigInput')
    expect(domain).toContain('configOverride')
  })

  it('lets operators inspect every truncated loot-audit preview result', () => {
    const form = source('src/app/(app-shell)/admin/dashboard/loot-audit/LootAuditForm.tsx')

    expect(form).toContain('showAllPreviewResults')
    expect(form).toContain('hasHiddenPreviewResults')
    expect(form).toContain("t('showAllResults')")
  })
})
