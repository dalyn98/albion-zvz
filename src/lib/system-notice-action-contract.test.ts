import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const actions = readFileSync(
  join(process.cwd(), 'src', 'app', 'super-admin', 'actions.ts'),
  'utf8',
)
const form = readFileSync(
  join(
    process.cwd(),
    'src',
    'app',
    '(app-shell)',
    'super-admin',
    'notices',
    'SystemNoticeForm.tsx',
  ),
  'utf8',
)

function functionBody(start: string, end: string): string {
  return actions.slice(actions.indexOf(start), actions.indexOf(end))
}

describe('system notice application contract', () => {
  it('uses only atomic notice commands from server actions', () => {
    const create = functionBody(
      'export async function createSystemNotice',
      'export async function updateSiteNicknameOverride',
    )
    const archive = functionBody(
      'export async function archiveSystemNotice',
      'export interface ManualSyncResult',
    )

    expect(create).toContain("db.rpc('replace_super_admin_notice'")
    expect(archive).toContain("db.rpc('archive_super_admin_notice'")
    expect(create).not.toContain(".from('super_admin_notices')")
    expect(archive).not.toContain(".from('super_admin_notices')")
    expect(create).not.toContain('logSuperAdminAction')
    expect(archive).not.toContain('logSuperAdminAction')
  })

  it('requires purpose, severity, and a future expiry in the operator form', () => {
    expect(form).toContain('name="purpose"')
    expect(form).toContain('name="severity"')
    expect(form).toContain('만료 시각은 필수입니다.')
    expect(form).toContain('parsed.getTime() <= Date.now()')
    expect(form).not.toContain('무기한 유지')
  })
})
