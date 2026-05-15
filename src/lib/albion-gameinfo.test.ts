import { describe, expect, it } from 'vitest'
import {
  ALBION_SERVERS,
  ALBION_SERVER_LABEL_KEY,
  isAlbionServer,
  type AlbionServer,
} from './albion-gameinfo'
import { ALBION_GAMEINFO_ENDPOINTS } from './albion-endpoints'

// 도메인 invariant 화석화: 3개 서버 (east/west/europe) 가 모두 동등하게 지원돼야 함.
// East 편향이 silent 폴백으로 새어 들어오는 회귀를 잡기 위한 화이트박스 검증.

describe('AlbionServer enum + type guard', () => {
  it('ALBION_SERVERS 가 정확히 3개 서버를 포함', () => {
    expect(ALBION_SERVERS).toHaveLength(3)
    expect(ALBION_SERVERS).toContain('east')
    expect(ALBION_SERVERS).toContain('west')
    expect(ALBION_SERVERS).toContain('europe')
  })

  it('isAlbionServer 가 유효 서버 3개 모두 true 반환', () => {
    expect(isAlbionServer('east')).toBe(true)
    expect(isAlbionServer('west')).toBe(true)
    expect(isAlbionServer('europe')).toBe(true)
  })

  it('isAlbionServer 가 비유효 입력에 false 반환 (silent east 폴백 금지)', () => {
    expect(isAlbionServer('')).toBe(false)
    expect(isAlbionServer('EAST')).toBe(false)
    expect(isAlbionServer('asia')).toBe(false)
    expect(isAlbionServer(null)).toBe(false)
    expect(isAlbionServer(undefined)).toBe(false)
    expect(isAlbionServer(0)).toBe(false)
    expect(isAlbionServer({})).toBe(false)
  })
})

describe('ALBION_SERVER_LABEL_KEY i18n 매핑', () => {
  it('3개 서버 모두 별도의 common 네임스페이스 키로 매핑', () => {
    expect(ALBION_SERVER_LABEL_KEY.east).toBe('albionServerEast')
    expect(ALBION_SERVER_LABEL_KEY.west).toBe('albionServerWest')
    expect(ALBION_SERVER_LABEL_KEY.europe).toBe('albionServerEurope')
  })

  it('각 서버의 라벨 키가 서로 distinct (label collision 방지)', () => {
    const keys = Object.values(ALBION_SERVER_LABEL_KEY)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('ALBION_SERVERS 의 모든 서버에 라벨 키가 있음', () => {
    for (const server of ALBION_SERVERS) {
      expect(ALBION_SERVER_LABEL_KEY[server]).toBeTruthy()
      expect(typeof ALBION_SERVER_LABEL_KEY[server]).toBe('string')
    }
  })
})

describe('ALBION_GAMEINFO_ENDPOINTS 서버별 호스트', () => {
  it('3개 서버 모두 distinct base URL 보유', () => {
    const urls = Object.values(ALBION_GAMEINFO_ENDPOINTS)
    expect(new Set(urls).size).toBe(3)
  })

  it('각 호스트가 Albion 공식 도메인 패턴', () => {
    for (const server of ALBION_SERVERS) {
      const url = ALBION_GAMEINFO_ENDPOINTS[server]
      expect(url).toMatch(/^https:\/\/gameinfo(-[a-z]+)?\.albiononline\.com\/api\/gameinfo$/)
    }
  })

  it('east → 싱가포르 (sgp), europe → 암스테르담 (ams), west → 기본 도메인', () => {
    expect(ALBION_GAMEINFO_ENDPOINTS.east).toContain('sgp')
    expect(ALBION_GAMEINFO_ENDPOINTS.europe).toContain('ams')
    expect(ALBION_GAMEINFO_ENDPOINTS.west).not.toContain('-')
  })
})

describe('AlbionServer 타입 exhaustiveness', () => {
  it('모든 ALBION_SERVERS 항목이 ALBION_SERVER_LABEL_KEY / ENDPOINTS 둘 다에 존재', () => {
    // 향후 4번째 서버 추가 시 한 곳만 업데이트 하는 누락을 잡는 화석.
    for (const server of ALBION_SERVERS) {
      expect(ALBION_SERVER_LABEL_KEY[server as AlbionServer]).toBeDefined()
      expect(ALBION_GAMEINFO_ENDPOINTS[server as AlbionServer]).toBeDefined()
    }
  })
})
