import { describe, expect, it } from 'vitest'
import { filterPublicZvzScaleRankingEvidence } from './public-zvz-record-scope'

describe('public ZvZ record scope', () => {
  const evidence = [
    { id: 'small-ranked', scale: 'small', scaleRankingEligible: true },
    { id: 'small-mismatch', scale: 'small', scaleRankingEligible: false },
    { id: 'mid-ranked', scale: 'mid', scaleRankingEligible: true },
  ] as const

  it('keeps every evidence row when no scale is selected', () => {
    expect(filterPublicZvzScaleRankingEvidence(evidence, null)).toEqual(evidence)
  })

  it('keeps only rank-eligible evidence in the selected scale', () => {
    expect(filterPublicZvzScaleRankingEvidence(evidence, 'small')).toEqual([
      evidence[0],
    ])
  })
})
