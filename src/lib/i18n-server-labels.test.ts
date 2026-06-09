import { describe, expect, it } from 'vitest'
import ko from '@/messages/ko.json'
import en from '@/messages/en.json'
import ja from '@/messages/ja.json'
import zh from '@/messages/zh.json'
import { ALBION_SERVERS, ALBION_SERVER_LABEL_KEY } from './albion-gameinfo'
import { ADMIN_ACTIONS, ADMIN_AUDIT_TARGET_KINDS } from './admin-audit'
import {
  ADMIN_ACTION_LABEL_KEY,
  ADMIN_AUDIT_TARGET_KIND_LABEL_KEY,
} from './admin-audit-i18n'

// i18n 키 → 라벨 매핑 일관성 화석화. `ALBION_SERVER_LABEL_KEY` 가 가리키는
// common 네임스페이스 키가 4 locale (ko/en/ja/zh) 모두에 존재하고 빈 문자열이
// 아닌지 검증. 한 locale 만 누락된 채 배포되어 "albionServerWest" 라는 raw 키
// 가 화면에 노출되는 회귀를 잡는다.

const LOCALES = { ko, en, ja, zh } as const

function nestedValue(root: Record<string, unknown> | undefined, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object') return undefined
    return (current as Record<string, unknown>)[part]
  }, root)
}

describe('common 네임스페이스 albion 서버 라벨 4 locale 동등', () => {
  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const server of ALBION_SERVERS) {
        const key = ALBION_SERVER_LABEL_KEY[server]
        it(`common.${key} (server=${server}) 존재 + 비어있지 않음`, () => {
          const common = (dict as { common?: Record<string, unknown> }).common
          expect(common).toBeDefined()
          const value = common?.[key]
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})

describe('albionOnboarding 서버 힌트 키 4 locale 동등', () => {
  const HINT_KEYS = ['serverHintEast', 'serverHintWest', 'serverHintEurope', 'stepServerHelp'] as const
  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const key of HINT_KEYS) {
        it(`albionOnboarding.${key} 존재 + 비어있지 않음`, () => {
          const onboarding = (dict as { albionOnboarding?: Record<string, unknown> }).albionOnboarding
          expect(onboarding).toBeDefined()
          const value = onboarding?.[key]
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})

describe('publicGuildProfile 서버 라벨 키 4 locale 동등', () => {
  const PROFILE_KEYS = [
    'server_east',
    'server_west',
    'server_europe',
    'serverEditLabel',
    'serverAddLabel',
    'serverDefaultOption',
  ] as const
  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const key of PROFILE_KEYS) {
        it(`publicGuildProfile.${key} 존재 + 비어있지 않음`, () => {
          const profile = (dict as { publicGuildProfile?: Record<string, unknown> })
            .publicGuildProfile
          expect(profile).toBeDefined()
          const value = profile?.[key]
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})

describe('adminSettings 로컬 계정 enum 라벨 4 locale 동등', () => {
  const LOCAL_ACCOUNT_KEYS = [
    'localAccountRelationHomeGuild',
    'localAccountRelationAlliance',
    'localAccountRelationExternal',
    'localAccountRelationUnknown',
    'localAccountTrustTrusted',
    'localAccountTrustClaimed',
    'localAccountTrustRosterMatched',
    'localAccountTrustDisputed',
    'localAccountTrustRevoked',
    'localAccountTrustUnknown',
  ] as const
  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const key of LOCAL_ACCOUNT_KEYS) {
        it(`adminSettings.${key} 존재 + 비어있지 않음`, () => {
          const adminSettings = (dict as { adminSettings?: Record<string, unknown> })
            .adminSettings
          expect(adminSettings).toBeDefined()
          const value = adminSettings?.[key]
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})

describe('adminKillbotPage 최근 전송 enum 라벨 4 locale 동등', () => {
  const DELIVERY_TYPE_KEYS = ['kill', 'death', 'battle', 'test'] as const
  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const key of DELIVERY_TYPE_KEYS) {
        it(`adminKillbotPage.deliveryType.${key} 존재 + 비어있지 않음`, () => {
          const adminKillbotPage = (dict as { adminKillbotPage?: Record<string, unknown> })
            .adminKillbotPage
          expect(adminKillbotPage).toBeDefined()
          const deliveryType = adminKillbotPage?.deliveryType
          expect(deliveryType).toBeDefined()
          expect(typeof deliveryType).toBe('object')
          const value = (deliveryType as Record<string, unknown>)?.[key]
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})

describe('adminAudit action/target enum 라벨 4 locale 동등', () => {
  it('모든 AdminAction 이 라벨 키에 매핑된다', () => {
    expect(Object.keys(ADMIN_ACTION_LABEL_KEY).sort()).toEqual([...ADMIN_ACTIONS].sort())
  })

  it('모든 AdminAuditTargetKind 가 라벨 키에 매핑된다', () => {
    expect(Object.keys(ADMIN_AUDIT_TARGET_KIND_LABEL_KEY).sort()).toEqual(
      [...ADMIN_AUDIT_TARGET_KINDS].sort(),
    )
  })

  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const [action, key] of Object.entries(ADMIN_ACTION_LABEL_KEY)) {
        it(`adminAudit.${key} (action=${action}) 존재 + 비어있지 않음`, () => {
          const adminAudit = (dict as { adminAudit?: Record<string, unknown> }).adminAudit
          expect(adminAudit).toBeDefined()
          const value = nestedValue(adminAudit, key)
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }

      for (const [targetKind, key] of Object.entries(ADMIN_AUDIT_TARGET_KIND_LABEL_KEY)) {
        it(`adminAudit.${key} (targetKind=${targetKind}) 존재 + 비어있지 않음`, () => {
          const adminAudit = (dict as { adminAudit?: Record<string, unknown> }).adminAudit
          expect(adminAudit).toBeDefined()
          const value = nestedValue(adminAudit, key)
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})
