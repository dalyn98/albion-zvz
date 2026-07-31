import { describe, it, expect } from 'vitest'
import {
  CAP,
  ALL_CAPABILITIES,
  ACTIVE_CAPABILITY_KEYS,
  CAPABILITY_GROUPS,
  CAPABILITY_PRESETS,
  DEPRECATED_CAPABILITY_KEYS,
  getCapabilityPresetBits,
  serializeCapabilities,
  parseCapabilities,
  hasCapability,
  hasAnyCapability,
  hasAllCapabilities,
} from './permissions'

describe('CAP definitions', () => {
  it('모든 capability 비트는 서로 겹치지 않는다 (인덱스 중복 금지)', () => {
    const values = Object.values(CAP)
    let combined = 0n
    for (const v of values) {
      expect(combined & v).toBe(0n)
      combined |= v
    }
    expect(combined).toBe(ALL_CAPABILITIES)
  })

  it('모든 capability 는 BigInt(2^62) 이하 = signed bigint 안전 범위', () => {
    const SAFE_MAX = 1n << 62n
    for (const v of Object.values(CAP)) {
      expect(v < SAFE_MAX).toBe(true)
    }
  })

  it('CAPABILITY_GROUPS 의 키 합집합 = 활성 capability 전체 키', () => {
    const grouped = new Set<string>(
      Object.values(CAPABILITY_GROUPS).flatMap((arr) => arr as string[]),
    )
    expect(grouped).toEqual(new Set(ACTIVE_CAPABILITY_KEYS))
  })

  it('deprecated capability 는 비트 의미만 보존하고 UI 그룹에는 노출하지 않는다', () => {
    const grouped = new Set<string>(
      Object.values(CAPABILITY_GROUPS).flatMap((arr) => arr as string[]),
    )
    for (const key of DEPRECATED_CAPABILITY_KEYS) {
      expect(grouped.has(key)).toBe(false)
      expect(CAP[key]).toBeDefined()
    }
  })

  it('role presets stay aligned with delegated route capabilities', () => {
    const presets = new Map(CAPABILITY_PRESETS.map((preset) => [preset.key, preset]))

    expect(presets.get('shopQuartermaster')?.capabilities).toContain('CHEST_LOG_PASTE')
    expect(CAPABILITY_GROUPS.finance).toEqual([
      'STATS_VIEW',
      'EXCHANGE_APPROVE',
      'DONATION_APPROVE',
    ])
    expect(CAPABILITY_GROUPS.compliance).toEqual([
      'CONTENT_COMPLIANCE_MANAGE',
    ])
    expect(presets.get('financeOfficer')?.capabilities).toEqual([
      'EXCHANGE_APPROVE',
      'DONATION_APPROVE',
      'STATS_VIEW',
    ])
    expect(presets.get('contentComplianceOfficer')?.capabilities).toEqual([
      'CONTENT_COMPLIANCE_MANAGE',
    ])
    expect(presets.get('logOfficer')?.capabilities).toEqual([
      'CHEST_LOG_PASTE',
      'SIPHON_MANAGE',
      'AUDIT_VIEW',
    ])
    expect(presets.get('analyst')?.capabilities).toEqual([
      'STATS_VIEW',
      'KILLBOARD_SYNC',
      'BATTLES_MANAGE',
      'AUDIT_VIEW',
    ])
    expect(CAPABILITY_GROUPS.settings).toContain('WORKSPACE_DELETE')
    expect(presets.get('guildSettings')?.capabilities).not.toContain(
      'WORKSPACE_DELETE',
    )

    for (const preset of CAPABILITY_PRESETS) {
      expect(getCapabilityPresetBits(preset.capabilities)).toBeGreaterThan(0n)
    }
  })
})

describe('serialize / parse', () => {
  it('round-trip 으로 동일 값', () => {
    const value = CAP.REGEAR_APPROVE | CAP.EVENT_MANAGE | CAP.AUDIT_VIEW
    expect(parseCapabilities(serializeCapabilities(value))).toBe(value)
  })

  it('serializeCapabilities — 음수는 "0" 으로 안전 fallback', () => {
    expect(serializeCapabilities(-1n)).toBe('0')
  })

  it('parseCapabilities — null / 빈 문자열 / 공백 → 0n', () => {
    expect(parseCapabilities(null)).toBe(0n)
    expect(parseCapabilities(undefined)).toBe(0n)
    expect(parseCapabilities('')).toBe(0n)
    expect(parseCapabilities('   ')).toBe(0n)
  })

  it('parseCapabilities — 숫자 아닌 입력은 0n', () => {
    expect(parseCapabilities('abc')).toBe(0n)
    expect(parseCapabilities('1.5')).toBe(0n)
    expect(parseCapabilities('-100')).toBe(0n)
    expect(parseCapabilities('0xff')).toBe(0n)
  })

  it('parseCapabilities — 큰 양의 정수도 정상 처리', () => {
    expect(parseCapabilities('1234567890123456789')).toBe(1234567890123456789n)
  })
})

describe('hasCapability / hasAny / hasAll', () => {
  it('hasCapability — 단일 비트 확인', () => {
    const bits = CAP.REGEAR_APPROVE
    expect(hasCapability(bits, CAP.REGEAR_APPROVE)).toBe(true)
    expect(hasCapability(bits, CAP.MEMBERS_MANAGE)).toBe(false)
  })

  it('hasCapability — 0n 비트는 어떤 capability 도 없음', () => {
    expect(hasCapability(0n, CAP.REGEAR_APPROVE)).toBe(false)
  })

  it('hasCapability — ALL_CAPABILITIES 는 모든 capability 보유', () => {
    for (const cap of Object.values(CAP)) {
      expect(hasCapability(ALL_CAPABILITIES, cap)).toBe(true)
    }
  })

  it('hasAnyCapability — 하나라도 있으면 true', () => {
    const bits = CAP.REGEAR_APPROVE
    expect(hasAnyCapability(bits, [CAP.MEMBERS_MANAGE, CAP.REGEAR_APPROVE])).toBe(
      true,
    )
    expect(hasAnyCapability(bits, [CAP.MEMBERS_MANAGE, CAP.AUDIT_VIEW])).toBe(
      false,
    )
  })

  it('hasAllCapabilities — 전부 있을 때만 true', () => {
    const bits = CAP.REGEAR_APPROVE | CAP.REGEAR_EDIT_PRICE
    expect(
      hasAllCapabilities(bits, [CAP.REGEAR_APPROVE, CAP.REGEAR_EDIT_PRICE]),
    ).toBe(true)
    expect(
      hasAllCapabilities(bits, [CAP.REGEAR_APPROVE, CAP.REGEAR_BULK_ACTION]),
    ).toBe(false)
  })

  it('hasAllCapabilities — 빈 배열은 true (vacuous truth)', () => {
    expect(hasAllCapabilities(0n, [])).toBe(true)
  })

  it('hasAnyCapability — 빈 배열은 false', () => {
    expect(hasAnyCapability(ALL_CAPABILITIES, [])).toBe(false)
  })
})

describe('비트 합성', () => {
  it('OR 합산 — 권한 누적', () => {
    const a = CAP.REGEAR_APPROVE
    const b = CAP.EVENT_MANAGE
    const combined = a | b
    expect(hasCapability(combined, a)).toBe(true)
    expect(hasCapability(combined, b)).toBe(true)
  })

  it('AND-NOT — 권한 회수', () => {
    const granted = CAP.REGEAR_APPROVE | CAP.REGEAR_EDIT_PRICE
    const revoked = CAP.REGEAR_EDIT_PRICE
    const final = granted & ~revoked
    expect(hasCapability(final, CAP.REGEAR_APPROVE)).toBe(true)
    expect(hasCapability(final, CAP.REGEAR_EDIT_PRICE)).toBe(false)
  })
})
