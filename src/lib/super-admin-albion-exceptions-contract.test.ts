import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const actions = readFileSync(
  join(process.cwd(), 'src', 'app', 'super-admin', 'actions.ts'),
  'utf8',
)
const page = readFileSync(
  join(
    process.cwd(),
    'src',
    'app',
    '(app-shell)',
    'super-admin',
    'albion-exceptions',
    'page.tsx',
  ),
  'utf8',
)

function functionBody(start: string, end: string): string {
  return actions.slice(actions.indexOf(start), actions.indexOf(end))
}

describe('super-admin Albion resource exception contract', () => {
  it('re-authorizes grant and revoke mutations and writes audit events', () => {
    const grant = functionBody(
      'export async function grantAlbionResourceExceptionAction',
      'export async function revokeAlbionResourceExceptionAction',
    )
    const revoke = functionBody(
      'export async function revokeAlbionResourceExceptionAction',
      'export async function mergeMemberAccountsAction',
    )

    for (const body of [grant, revoke]) {
      expect(body).toContain('await requireSuperAdmin()')
      expect(body).toContain('await logSuperAdminAction({')
      expect(body.indexOf('await requireSuperAdmin()')).toBeLessThan(
        body.indexOf('AlbionIdentityResourceException'),
      )
    }
  })

  it('requires tenant, Discord ID, and an operator reason in the UI', () => {
    expect(page).toContain('name="guildId"')
    expect(page).toContain('name="discordId"')
    expect(page).toContain('name="reason"')
    expect(page).toContain('pattern="[0-9]{15,25}"')
    expect(page).toContain('minLength={3}')
  })
})
