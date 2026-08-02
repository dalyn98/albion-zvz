import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8')
}

function asyncFunctionBody(file: string, name: string): string {
  const declaration = new RegExp(`(?:export\\s+)?async\\s+function\\s+${name}\\s*\\(`)
  const match = declaration.exec(file)
  expect(match, `${name} declaration`).not.toBeNull()
  const start = match?.index ?? 0
  const remainder = file.slice(start + (match?.[0].length ?? 0))
  const next = remainder.search(/\n(?:export\s+)?async\s+function\s+[A-Za-z0-9_]+\s*\(/)
  return next < 0 ? file.slice(start) : file.slice(start, start + (match?.[0].length ?? 0) + next)
}

const DIRECT_MEMBER_MUTATIONS: ReadonlyArray<{
  file: string
  functions: readonly string[]
}> = [
  {
    file: '../app/actions/donation.ts',
    functions: ['requestDonation', 'cancelMyDonationRequest'],
  },
  {
    file: '../app/actions/exchange.ts',
    functions: [
      'requestExchange',
      'cancelMyExchangeRequest',
      'updateMyExchangeRequest',
    ],
  },
  { file: '../app/actions/transfer.ts', functions: ['transferPoints'] },
  {
    file: '../app/actions/shop-member.ts',
    functions: [
      'reviewShopOrder',
      'submitShopOrder',
      'cancelMyOrder',
      'confirmMyShopOrderPriceReview',
    ],
  },
  {
    file: '../app/actions/regear-edit.ts',
    functions: [
      'cancelMyRegearRequest',
      'updateMyRegearBuildSnapshotSlot',
      'updateMyManualRegearScreenshots',
      'updateMyManualRegearVideoProof',
      'updateMyRegearLineItemPrice',
      'updateMyManualRegearClaim',
    ],
  },
  {
    file: '../app/actions/regear-tracked-deaths.ts',
    functions: ['submitTrackedAdHocRegear'],
  },
  {
    file: '../app/actions/regear-windows.ts',
    functions: ['requestWindowRegear'],
  },
  {
    file: '../app/actions/onboarding.ts',
    functions: [
      'confirmAlbionIdentity',
      'setAlbionIdentityManually',
      'refreshMyAlbionIdentity',
    ],
  },
  {
    file: '../app/actions/member-activity-visibility.ts',
    functions: ['setMyActivityVisibility', 'setMyLeaderboardVisibility'],
  },
  {
    file: '../app/actions/build-sheet.ts',
    functions: ['submitBuildSheetApplication', 'cancelBuildSheetApplication'],
  },
  {
    file: '../app/actions/event-tentative.ts',
    functions: ['submitMyTentativeSignup', 'removeTentativeSignup'],
  },
  {
    file: '../app/actions/member.ts',
    functions: ['assignSlot', 'cancelSlot'],
  },
  {
    file: '../app/actions/craft-orders.ts',
    functions: [
      'claimCraftOrder',
      'releaseCraftOrderTask',
      'deliverCraftOrderTask',
    ],
  },
  {
    file: '../app/actions/alliance-content-compliance.ts',
    functions: ['submitAllianceContentVideo', 'submitMemberGameplayVideo'],
  },
  {
    file: '../app/actions/language.ts',
    functions: ['setMyPreferredLanguage'],
  },
  {
    file: '../app/actions/notifications.ts',
    functions: [
      'setMyTimezone',
      'setMyDmPreference',
      'setMyCategoryPreference',
    ],
  },
]

describe('member mutation live-session boundary', () => {
  it.each(DIRECT_MEMBER_MUTATIONS)(
    'refreshes current actor state for member mutations in $file',
    ({ file, functions }) => {
      const contents = source(file)
      for (const name of functions) {
        expect(asyncFunctionBody(contents, name), `${file}:${name}`).toContain(
          'requireCurrentMutationSession()',
        )
      }
    },
  )

  it('centralizes shared member-trade authorization on the current actor', () => {
    const contents = source('../app/actions/member-trade.ts')
    expect(asyncFunctionBody(contents, 'requireMemberTradeSession')).toContain(
      'requireCurrentMutationSession()',
    )
  })

  it('uses the current actor for both treasury reads and allocation', () => {
    const contents = source('../app/actions/treasury-deposits.ts')
    expect(asyncFunctionBody(contents, 'trustedTreasuryMember')).toContain(
      'requireCurrentMutationSession()',
    )
    for (const name of [
      'listMyUnallocatedTreasuryDeposits',
      'allocateMyTreasuryDeposit',
    ]) {
      expect(asyncFunctionBody(contents, name), name).toContain(
        'trustedTreasuryMember()',
      )
    }
  })

  it('keeps the main regear request behind its guarded implementation', () => {
    const contents = source('../app/actions/regear.ts')
    expect(asyncFunctionBody(contents, 'requestRegear')).toContain(
      'requestRegearInner',
    )
    expect(asyncFunctionBody(contents, 'requestRegearInner')).toContain(
      'requireCurrentMutationSession()',
    )
  })
})
