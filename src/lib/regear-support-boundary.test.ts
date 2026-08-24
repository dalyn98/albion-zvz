import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

function exportedFunctionBody(file: string, functionName: string): string {
  const contents = source(file)
  const start = contents.indexOf(`export async function ${functionName}`)
  expect(start, `${file}:${functionName}`).toBeGreaterThan(-1)
  const next = contents.indexOf('\nexport async function ', start + 1)
  return contents.slice(start, next === -1 ? undefined : next)
}

describe('regear support cross-surface boundary', () => {
  it('blocks new claims while allowing pending claim maintenance during draining', () => {
    const intakeFunctions: Array<[string, string]> = [
      ['src/app/actions/regear.ts', 'requestRegear'],
      ['src/app/actions/regear-windows.ts', 'requestWindowRegear'],
      ['src/app/actions/regear-tracked-deaths.ts', 'submitTrackedAdHocRegear'],
    ]
    const maintenanceFunctions: Array<[string, string]> = [
      ['src/app/actions/regear-edit.ts', 'cancelMyRegearRequest'],
      ['src/app/actions/regear-edit.ts', 'updateMyRegearBuildSnapshotSlot'],
      ['src/app/actions/regear-edit.ts', 'updateMyManualRegearScreenshots'],
      ['src/app/actions/regear-edit.ts', 'updateMyManualRegearVideoProof'],
      ['src/app/actions/regear-edit.ts', 'updateMyRegearLineItemPrice'],
      ['src/app/actions/regear-edit.ts', 'updateMyManualRegearClaim'],
    ]

    for (const [file, functionName] of intakeFunctions) {
      expect(exportedFunctionBody(file, functionName)).toContain(
        'isRegearIntakeEnabled(guildId)',
      )
    }
    for (const [file, functionName] of maintenanceFunctions) {
      expect(exportedFunctionBody(file, functionName)).toContain(
        'isRegearSupported(guildId)',
      )
    }
  })

  it('requires crafted support for member and admin craft configuration mutations', () => {
    const functions: Array<[string, string]> = [
      ['src/app/actions/craft.ts', 'setMyCrafterDefaults'],
      ['src/app/actions/craft.ts', 'computeAutoAssignBox'],
      ['src/app/actions/craft.ts', 'markCraftPickupCollected'],
      ['src/app/actions/craft-admin.ts', 'setMemberCrafterFlag'],
      ['src/app/actions/craft-admin.ts', 'setCrafterBoxRange'],
      ['src/app/actions/craft-admin.ts', 'updateCraftSettingsAdmin'],
      ['src/app/actions/craft-queue.ts', 'claimCraftQueueItem'],
      ['src/app/actions/craft-queue.ts', 'releaseCraftQueueItem'],
      ['src/app/actions/craft-queue.ts', 'bulkClaimCraftQueueItems'],
      ['src/app/actions/craft-queue.ts', 'bulkReleaseCraftQueueItems'],
      ['src/app/actions/craft-queue.ts', 'deliverCraftQueueItem'],
    ]

    for (const [file, functionName] of functions) {
      expect(exportedFunctionBody(file, functionName)).toContain(
        'isCraftedRegearSupported(guildId)',
      )
    }
  })

  it('uses the same disabled event policy boundary for web, Discord, and automatic starts', () => {
    const policyServer = source('src/lib/regear-effective-policy-server.ts')
    const webAndDiscordStart = source('src/lib/event-start-application-command.ts')
    const automaticStart = source('src/lib/event-auto-start.ts')

    expect(policyServer).toContain('isRegearSupported(input.guildId)')
    expect(policyServer).toContain("regear_policy: 'disabled'")
    expect(webAndDiscordStart).toContain('prepareEventEffectiveRegearPolicyStart')
    expect(automaticStart).toContain('startEventWithEffectiveRegearPolicies')
  })

  it('keeps Discord status reads but blocks claim and craft command mutations', () => {
    const suite = source('src/lib/discord-command-suite.ts')
    const autocomplete = source('src/lib/discord-command-autocomplete.ts')
    const commerce = source('src/lib/discord-command-commerce-admin.ts')

    expect(suite).toContain("input.path === 'regear.eligible'")
    expect(suite).toContain('isRegearIntakeEnabled(input.tenant.id)')
    expect(suite).toContain('isCraftedRegearSupported(input.tenant.id)')
    expect(suite).toContain("case 'regear.status':")
    expect(autocomplete).toContain('isCraftedRegearSupported(tenant.id)')
    expect(commerce).toContain("kindFilter === 'regear' && !regearSupported")
  })

  it('retains a regear history entry point and does not couple guild orders to support state', () => {
    const shell = source('src/components/AppShell.tsx')
    const sidebar = source('src/components/AppSidebar.tsx')

    expect(sidebar).toContain("i.href === '/regear' && !regearSupported")
    expect(sidebar).toContain("'regearHistory'")
    expect(shell).toContain("getAppSetting('craft_regear_enabled', 'false', guildId)")
    expect(shell).toContain("legacyCraftFeatureEnabledRaw === 'true'")
  })
})
