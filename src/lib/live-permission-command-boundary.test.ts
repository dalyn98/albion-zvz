import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function exportedFunctionBody(
  file: string,
  name: string,
  nextName?: string,
): string {
  const start = file.indexOf(`export async function ${name}`)
  const end = nextName
    ? file.indexOf(`export async function ${nextName}`, start + 1)
    : file.length
  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)
  return file.slice(start, end)
}

describe('live permission command boundary', () => {
  it('makes every shared admin/capability/event gate resolve current Discord membership', () => {
    const auth = source('./auth.ts')
    expect(auth).toMatch(
      /requireLiveSession[\s\S]*resolveLiveDiscordAuthorization\(signedSession\)/,
    )
    for (const gate of [
      'requireAdmin',
      'requireCapability',
      'requireAnyCapability',
      'requireEventCreator',
      'requireEventCreatorForEvent',
      'requireEventCreatorOrPartyCaller',
      'requireEventCreatorForSlot',
    ]) {
      const body = exportedFunctionBody(auth, gate)
      expect(body).toContain('requireLiveSession()')
    }
  })

  it('does not let permission-editor commands authorize from their old cookie', () => {
    const actions = source('../app/actions/permissions.ts')
    const operator = actions.slice(
      actions.indexOf('async function requirePermissionOperator'),
      actions.indexOf('function isOptimisticConflict'),
    )
    expect(operator).toContain('requireLiveSession()')
    expect(operator).toContain('CAP.SETTINGS_PERMISSIONS')
    expect(actions).toContain('refreshOperatorSession')
    expect(actions).toContain('resolveDiscordAuthorization')
  })

  it('refreshes all event administration and delegated build-sheet mutations', () => {
    const eventActions = source('../app/actions/admin-event.ts')
    expect(eventActions).not.toContain('getSession()')
    for (const [name, next] of [
      ['createDraftEvent', 'createEvent'],
      ['createEvent', 'updateEvent'],
      ['updateEvent', 'getEventPublishSummary'],
      ['getEventPublishSummary', 'publishEvent'],
      ['publishEvent', 'notifyEvent'],
      ['notifyEvent', 'cloneEvent'],
      ['cloneEvent', 'deleteEvent'],
      ['deleteEvent', 'startBattle'],
      ['startBattle', undefined],
    ] as const) {
      expect(exportedFunctionBody(eventActions, name, next)).toContain(
        'requireLiveSession()',
      )
    }

    const buildSheet = source('../app/actions/build-sheet.ts')
    for (const [name, next] of [
      ['saveBuildSheetPlan', 'submitBuildSheetApplication'],
      ['assignBuildSheetApplication', 'unassignBuildSheetApplication'],
      ['unassignBuildSheetApplication', undefined],
    ] as const) {
      expect(exportedFunctionBody(buildSheet, name, next)).toContain(
        'requireLiveSession()',
      )
    }
  })

  it('refreshes custom high-impact member, battle, inventory, and craft paths', () => {
    const requiredSources = [
      '../app/actions/admin-team.ts',
      '../app/actions/battles.ts',
      '../app/actions/bomb-squad.ts',
      '../app/actions/event-regear-participants.ts',
      '../app/actions/event-tentative.ts',
      '../app/actions/inventory.ts',
      '../app/actions/inventory-tracked.ts',
      '../app/actions/killbot-admin.ts',
      '../app/actions/member.ts',
      '../app/actions/members-admin.ts',
      '../app/actions/notifications.ts',
      '../app/actions/siphon-admin.ts',
      '../app/actions/tactics.ts',
      '../app/actions/craft.ts',
      '../app/actions/craft-queue.ts',
    ]
    for (const relativePath of requiredSources) {
      expect(source(relativePath), relativePath).toContain('requireLiveSession')
    }
  })

  it('resolves Discord interactions from payload roles and capability rows only', () => {
    const commandAuth = source('./discord-command-auth.ts')
    expect(commandAuth).toContain(
      'const roleIds = (input.payload.member?.roles ?? [])',
    )
    expect(commandAuth).toContain('resolveUserCapabilities')
    expect(commandAuth).not.toMatch(
      /input\.tenant\.adminRoleIds\.(includes|some)/,
    )

    const approvalAuth = source('./discord-admin-auth.ts')
    expect(approvalAuth).toContain('const roleIds = payload.member?.roles ?? []')
    expect(approvalAuth).toContain('resolveUserCapabilities')
  })

  it('reauthenticates a signed cookie through current Discord membership', () => {
    const refreshRoute = source('../app/api/auth/refresh-session/route.ts')
    expect(refreshRoute).toContain('verifySession')
    expect(refreshRoute).toContain('resolveLiveDiscordAuthorization')
    expect(refreshRoute).toContain('signSession')
  })
})
