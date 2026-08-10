import { describe, expect, it } from 'vitest'
import { formatGatherTimeFor } from './gather-time'

describe('formatGatherTimeFor', () => {
  it('formats gather previews in the active locale', () => {
    const iso = '2026-06-01T12:30:00.000Z'

    expect(formatGatherTimeFor('ko', iso, 'Asia/Seoul')).toBe('6월 1일 21시 30분')
    expect(formatGatherTimeFor('ja', iso, 'Asia/Seoul')).toBe('6月1日 21時30分')
    expect(formatGatherTimeFor('zh', iso, 'Asia/Seoul')).toBe('6月1日 21时30分')
    expect(formatGatherTimeFor('en', iso, 'Asia/Seoul')).toBe('Jun 1 21:30 KST')
  })

  it('uses native Intl formatting for added locales', () => {
    const iso = '2025-06-01T12:30:00.000Z'
    expect(formatGatherTimeFor('de', iso, 'Europe/Berlin')).toMatch(/1\.? Juni.*14:30/i)
    expect(formatGatherTimeFor('ar', iso, 'Asia/Seoul')).not.toContain('월')
  })
})
