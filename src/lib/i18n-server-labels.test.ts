import { describe, expect, it } from 'vitest'
import ko from '@/messages/ko.json'
import en from '@/messages/en.json'
import ja from '@/messages/ja.json'
import zh from '@/messages/zh.json'
import { ALBION_SERVERS, ALBION_SERVER_LABEL_KEY } from './albion-gameinfo'
import { AODP_ALLOWED_CITIES, AODP_CITY_LABEL_KEY } from './shop/aodp-constants'
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

function collectStringValues(
  root: unknown,
  prefix = '',
  out: Array<{ path: string; value: string }> = [],
): Array<{ path: string; value: string }> {
  if (typeof root === 'string') {
    out.push({ path: prefix, value: root })
    return out
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return out
  for (const [key, child] of Object.entries(root)) {
    collectStringValues(child, prefix ? `${prefix}.${key}` : key, out)
  }
  return out
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

describe('common 네임스페이스 AODP 도시 라벨 4 locale 동등', () => {
  it('모든 AODP 허용 도시가 라벨 키에 매핑된다', () => {
    expect(Object.keys(AODP_CITY_LABEL_KEY).sort()).toEqual([...AODP_ALLOWED_CITIES].sort())
  })

  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const city of AODP_ALLOWED_CITIES) {
        const key = AODP_CITY_LABEL_KEY[city]
        it(`common.${key} (city=${city}) 존재 + 비어있지 않음`, () => {
          const common = (dict as { common?: Record<string, unknown> }).common
          expect(common).toBeDefined()
          const value = nestedValue(common, key)
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }
})

describe('비영어 메시지 raw DB/status 문자열 노출 방지', () => {
  const RAW_TOKEN_PATTERN =
    /\b(?:pending|draft|superseded|victim|battle_started_at|point_ledger|withdrawn_at|admin_adjust|transfer_in|transfer_out)\b/
  const ALLOWED_PATHS = new Set([
    'adminLootAuditPage.lootLogPlaceholder',
    'adminLootAuditPage.parseErrorReasonLootMissingHeaders',
  ])

  for (const [localeCode, dict] of Object.entries({ ko, ja, zh })) {
    it(`${localeCode} 메시지 값에 raw DB/status 토큰이 남지 않는다`, () => {
      const offenders = collectStringValues(dict)
        .filter(({ path }) => !ALLOWED_PATHS.has(path))
        .filter(({ value }) => RAW_TOKEN_PATTERN.test(value.replace(/\{[^}]+}/g, '')))
        .map(({ path, value }) => `${path}: ${value}`)

      expect(offenders).toEqual([])
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

describe('adminAodp 품질 옵션 포맷 4 locale 동등', () => {
  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      it('adminAodp.qualityOption 존재 + value/label placeholder 유지', () => {
        const adminAodp = (dict as { adminAodp?: Record<string, unknown> }).adminAodp
        expect(adminAodp).toBeDefined()
        const value = adminAodp?.qualityOption
        expect(typeof value).toBe('string')
        expect(value).toContain('{value}')
        expect(value).toContain('{label}')
      })
    })
  }
})

describe('adminShopBaseline 상태 라벨 4 locale 동등', () => {
  const STATUS_KEYS = ['statusActive', 'statusSuperseded'] as const
  const RAW_STATUS_VALUES = ['active', 'superseded'] as const
  for (const [localeCode, dict] of Object.entries(LOCALES)) {
    describe(localeCode, () => {
      for (const key of STATUS_KEYS) {
        it(`adminShopBaseline.${key} 존재 + 비어있지 않음`, () => {
          const adminShopBaseline = (dict as { adminShopBaseline?: Record<string, unknown> })
            .adminShopBaseline
          expect(adminShopBaseline).toBeDefined()
          const value = adminShopBaseline?.[key]
          expect(typeof value).toBe('string')
          expect((value as string).trim().length).toBeGreaterThan(0)
        })
      }
    })
  }

  for (const [localeCode, dict] of Object.entries({ ko, ja, zh })) {
    it(`${localeCode} adminShopBaseline 상태 라벨이 raw DB status 가 아님`, () => {
      const adminShopBaseline = (dict as { adminShopBaseline?: Record<string, unknown> })
        .adminShopBaseline
      for (const key of STATUS_KEYS) {
        expect(RAW_STATUS_VALUES).not.toContain(adminShopBaseline?.[key] as string)
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
