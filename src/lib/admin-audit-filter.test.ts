import { describe, expect, it } from 'vitest'
import { auditDateBoundaryUtc, resolveAuditDate } from './admin-audit-filter'

describe('admin audit date filters', () => {
  it('rejects calendar dates that only match the input shape', () => {
    expect(resolveAuditDate('2026-02-29')).toBeUndefined()
    expect(resolveAuditDate('2026-13-01')).toBeUndefined()
    expect(resolveAuditDate('2026-07-22')).toBe('2026-07-22')
    expect(resolveAuditDate('2024-02-29')).toBe('2024-02-29')
  })

  it('uses the tenant local day instead of UTC midnight', () => {
    expect(auditDateBoundaryUtc('2026-07-22', 'Asia/Seoul', 'start')).toBe(
      '2026-07-21T15:00:00.000Z',
    )
    expect(auditDateBoundaryUtc('2026-07-22', 'Asia/Seoul', 'end')).toBe(
      '2026-07-22T14:59:59.999Z',
    )
  })

  it('keeps daylight-saving boundaries correct', () => {
    expect(auditDateBoundaryUtc('2026-07-22', 'America/New_York', 'start')).toBe(
      '2026-07-22T04:00:00.000Z',
    )
    expect(auditDateBoundaryUtc('2026-11-01', 'America/New_York', 'end')).toBe(
      '2026-11-02T04:59:59.999Z',
    )
  })
})
