import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('experimental tactics product boundary', () => {
  it('hides discovery and gates member, operator, event, and write paths', () => {
    const shell = source('src/components/AppShell.tsx')
    const sidebar = source('src/components/AppSidebar.tsx')
    expect(shell).toContain(
      "getAppSetting('tactics_experimental_enabled', 'false', guildId)",
    )
    expect(sidebar).toContain('tacticsOnly: true')
    expect(sidebar).toContain('!i.tacticsOnly || tacticsExperimentalEnabled')

    for (const path of [
      'src/app/(app-shell)/admin/dashboard/tactics/page.tsx',
      'src/app/(app-shell)/admin/dashboard/tactics/[id]/page.tsx',
      'src/app/(app-shell)/tactics/page.tsx',
      'src/app/(app-shell)/tactics/[id]/page.tsx',
      'src/app/(app-shell)/events/[id]/tactic/page.tsx',
      'src/app/actions/tactics.ts',
      'src/app/actions/event-operations.ts',
    ]) {
      expect(source(path), path).toContain('TacticsExperimental')
    }
  })

  it('keeps bearer pages unindexed, read-only, expiring, and revocable', () => {
    const layout = source('src/app/(public-shell)/tactics/share/layout.tsx')
    const page = source('src/app/(public-shell)/tactics/share/[token]/page.tsx')
    const editor = source('src/components/tactics/TacticEditor.tsx')
    const actions = source('src/app/actions/tactics.ts')
    expect(layout).toContain('index: false')
    expect(layout).toContain("referrer: 'no-referrer'")
    expect(page).toContain('shared />')
    expect(editor).toContain('revokeTacticShareLink')
    expect(actions).toContain('defaultTacticShareExpiresAt')
    expect(actions).toContain("db.rpc('issue_tactic_share_link'")
    expect(actions).toContain("db.rpc('revoke_tactic_share_link'")
  })

  it('offers an explicit administrator opt-in without making onboarding mandatory', () => {
    const settings = source('src/app/actions/settings.ts')
    const form = source('src/components/TacticsExperimentalSettingsForm.tsx')
    const activation = source(
      'supabase/migrations/324_atomic_tenant_activation_contract.sql',
    )
    expect(settings).toContain("'tactics_experimental_enabled'")
    expect(form).toContain("'tactics_experimental_enabled'")
    expect(activation).not.toContain("'tactics_experimental_enabled'")
  })
})
