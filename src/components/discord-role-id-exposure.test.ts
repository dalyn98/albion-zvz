import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()

function source(path: string): string {
  return readFileSync(join(ROOT, path), 'utf8')
}

describe('Discord identifiers in user-facing role controls', () => {
  it('shows role names instead of raw Discord role IDs', () => {
    const roleSelectors = [
      'src/components/ActiveMemberRolesSetting.tsx',
      'src/components/AdminRoleSetting.tsx',
      'src/components/EventCreatorRolesSetting.tsx',
      'src/components/BombSquadCallerRolesSetting.tsx',
    ]

    for (const path of roleSelectors) {
      const component = source(path)
      expect(component, path).not.toMatch(/>\s*\{role\.id\}\s*</)
      expect(component, path).toContain('@{role.name}')
    }

    expect(source('src/components/RegearDiscordRolePoliciesEditor.tsx'))
      .not.toMatch(/>\s*\{policy\.discordRoleId\}\s*</)
    expect(source('src/components/RegearDiscordRoleRateFloorsEditor.tsx'))
      .not.toMatch(/>\s*\{policy\.discordRoleId\}\s*</)
  })

  it('does not fall back to raw Discord user IDs in permission management', () => {
    const editor = source(
      'src/app/(app-shell)/admin/dashboard/permissions/PermissionsEditor.tsx',
    )
    const demo = source('src/app/(public-shell)/demo/permissions/page.tsx')

    expect(editor).not.toContain('member?.name ?? override.discordId')
    expect(editor).not.toContain('>{initial.discordId}</option>')
    expect(demo).not.toContain("t('userOverrideEditor.discordIdLabel')")
  })

  it('renders permission grants from resolved Discord role names', () => {
    const editor = source(
      'src/app/(app-shell)/admin/dashboard/permissions/PermissionsEditor.tsx',
    )

    expect(editor).toContain('resolveDiscordRoleDisplayName')
    expect(editor).not.toContain('@{grant.discordRoleName}')
    expect(editor).not.toContain('>{initial.discordRoleName}</option>')
  })
})
