import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('final performance optimization source', () => {
  it('loads a tenant-scoped event snapshot after access is granted', () => {
    const page = read('src/app/(app-shell)/events/[id]/page.tsx')
    const accessGateIndex = page.indexOf('if (isAccessDenied)')
    const revisionIndex = page.indexOf('loadEventRenderRevision(')
    const snapshotIndex = page.indexOf('loadEventRenderSnapshot(')

    expect(page).toContain("from '@/lib/event-render-snapshot'")
    expect(revisionIndex).toBeGreaterThan(accessGateIndex)
    expect(snapshotIndex).toBeGreaterThan(revisionIndex)
    expect(page).not.toContain('async function getEvent(')
  })

  it('keeps independent event reads in the main parallel fanout', () => {
    const page = read('src/app/(app-shell)/events/[id]/page.tsx')
    const fanout = page.slice(
      page.indexOf('const [\n    avatarMap,'),
      page.indexOf('for (const [discordId, displayName]'),
    )

    expect(fanout).toContain(".from('event_regear_participants')")
  })

  it('loads slot picker modals only after user intent', () => {
    const slotCard = read('src/components/SlotCard.tsx')

    expect(slotCard).toContain("import dynamic from 'next/dynamic'")
    expect(slotCard).toContain("void import('./SlotCardPickerModals')")
    expect(slotCard).not.toContain(
      "import { GearChoiceModal, SlotApplyConfirmModal, SoloBombGearModal } from './SlotCardPickerModals'",
    )
  })

  it('keeps non-default market tabs and the dispute dialog out of the initial module', () => {
    const market = read('src/components/MemberTradeMarket.tsx')

    expect(market).toContain("import dynamic from 'next/dynamic'")
    expect(market).toContain("import('./member-trade/MemberTradeSellTab')")
    expect(market).toContain("import('./member-trade/MemberTradeOrdersTab')")
    expect(market).toContain("import('./member-trade/MemberTradeOffersTab')")
    expect(market).toContain("import('./MemberTradeDisputeDialog')")
  })

  it('defers offscreen work for long member and battle lists', () => {
    for (const path of [
      'src/components/GuildMemberList.tsx',
      'src/components/BattleRecordList.tsx',
    ]) {
      const source = read(path)
      expect(source, path).toContain("contentVisibility: 'auto'")
      expect(source, path).toContain('containIntrinsicSize:')
    }
  })

  it('parallelizes member translations and defers dashboard analytics', () => {
    const memberDetail = read('src/components/MemberDetailView.tsx')
    const dashboard = read('src/app/(app-shell)/admin/dashboard/page.tsx')

    expect(memberDetail).toMatch(/const \[\s*t,\s*tIdentity,[\s\S]+\] = await Promise\.all\(/)
    expect(dashboard).toContain("import { after } from 'next/server'")
    expect(dashboard).toContain('after(async () => {')
  })
})
