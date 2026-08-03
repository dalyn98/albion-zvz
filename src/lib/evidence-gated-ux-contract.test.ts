import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('evidence-gated UX improvements', () => {
  it('disambiguates categorized Discord channels without changing the setup flow', () => {
    const page = source('src/app/(app-shell)/onboard/setup/[id]/page.tsx')
    const form = source('src/components/TenantSetupForm.tsx')

    expect(page).toContain('const categoryNames = new Map(')
    expect(page).toContain('parentName: c.parent_id ? categoryNames.get(c.parent_id)')
    expect(form).toContain('formatDiscordChannelLabel(c)')
  })

  it('keeps settings tabs horizontal while revealing hidden mobile tabs', () => {
    const tabs = source('src/components/SettingsTabs.tsx')
    const demoTabs = source('src/app/(public-shell)/demo/_components/DemoSettingsTabs.tsx')

    expect(tabs).toContain("activeTabRef.current?.scrollIntoView({")
    expect(tabs).toContain('setHasHiddenTabs(remaining > 2)')
    expect(tabs).toContain('bg-gradient-to-l from-gray-950 to-transparent sm:hidden')
    expect(demoTabs).toContain("activeTabRef.current?.scrollIntoView({")
    expect(demoTabs).toContain('setHasHiddenTabs(remaining > 2)')
  })

  it('gives event discovery and slot actions a minimum 40px hit area', () => {
    const grid = source('src/components/EventPartyGrid.tsx')
    const slot = source('src/components/SlotCard.tsx')

    expect(grid).toContain('inline-flex min-h-10 items-center')
    expect(grid).toContain('className="min-h-10 rounded-full')
    expect(slot).toContain('flex min-h-10 w-full items-center justify-center')
  })

  it('measures uncertain workflows without collecting authored content or ids', () => {
    const files = [
      'src/components/tactics/TacticEditor.tsx',
      'src/components/CraftQueueClient.tsx',
      'src/components/CraftQueueDialogs.tsx',
      'src/app/(app-shell)/admin/dashboard/permissions/PermissionsEditor.tsx',
      'src/components/EventPartyGrid.tsx',
      'src/components/SlotCard.tsx',
    ].map(source).join('\n')

    for (const workflow of [
      'tactic_edit',
      'craft_claim',
      'permission_override',
      'event_slot_signup',
    ]) {
      expect(files).toContain(`workflow: '${workflow}'`)
    }
    expect(files).not.toContain('metadata: { discordId')
    expect(files).not.toContain('metadata: { taskId')
    expect(files).not.toContain('metadata: { title')
    expect(files).not.toContain('metadata: { notes')
  })
})
