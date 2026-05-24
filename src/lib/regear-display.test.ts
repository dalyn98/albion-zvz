import { describe, expect, it } from 'vitest'
import { shouldShowKillboardUnverified } from './regear-display'

describe('regear display helpers', () => {
  it('does not show killboard-unverified warnings for overcharge claims', () => {
    expect(
      shouldShowKillboardUnverified({
        requestType: 'overcharge',
        killboardVerified: false,
        status: 'pending',
      }),
    ).toBe(false)
  })

  it('shows killboard-unverified warnings only for pending death claims', () => {
    expect(
      shouldShowKillboardUnverified({
        requestType: 'death',
        killboardVerified: false,
        status: 'pending',
      }),
    ).toBe(true)
    expect(
      shouldShowKillboardUnverified({
        requestType: 'death',
        killboardVerified: true,
        status: 'pending',
      }),
    ).toBe(false)
    expect(
      shouldShowKillboardUnverified({
        requestType: 'death',
        killboardVerified: false,
        status: 'approved',
      }),
    ).toBe(false)
  })
})
