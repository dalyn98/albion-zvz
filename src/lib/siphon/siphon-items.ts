// 사이펀 (Siphoned Energy) 아이템 화이트리스트.
//
// 과거 6필드 길드 금고 로그 paste 시, 사이펀 외 다른 아이템 (실버, 다른 토큰 등) 이
// 섞일 수 있어 siphon-ledger 테이블에 들어갈 행만 골라내야 한다.
//
// 매칭 기준: 원본 아이템명이 아래 SIPHON_NAMES 중 하나와 정확히 일치
// (대소문자/공백 정규화 후). 알비온 클라이언트 locale 별로 표기가 다르므로
// 모든 공식 locale 을 등재.
//
// 출처: .cache/items.json 의 UNIQUE_GVGTOKEN_GENERIC 엔트리. 알비온 클라이언트
// LocalizedNames 와 동일.

// 모든 locale 명을 lowercase 로 보관 — 비교도 lowercase 로.
const SIPHON_NAMES_NORMALIZED: ReadonlySet<string> = new Set([
  'siphoned energy', // EN-US
  '착취한 에너지', // KO-KR
  'サイフォンエネルギー', // JA-JP
  '虹吸能量', // ZH-CN / ZH-TW
  'gesammelte energie', // DE-DE
  'énergie siphonnée', // FR-FR
  'выкачанная энергия', // RU-RU
  'wyssana energia', // PL-PL
  'energía embotellada', // ES-ES
  'energia engarrafada', // PT-BR
  'energia estratta', // IT-IT
  'energi tersedot', // ID-ID
  'özümlenmiş enerji', // TR-TR
  'الطاقة المُستخلصة', // AR-SA
])

// 알비온 UniqueName — UNIQUE_GVGTOKEN_GENERIC. 일부 추출 도구가 raw item
// 코드를 그대로 흘려보내는 경우 대비.
const SIPHON_UNIQUE_NAME = 'UNIQUE_GVGTOKEN_GENERIC'

export function isSiphonItemName(raw: string): boolean {
  if (!raw) return false
  const normalized = raw.trim().toLowerCase()
  if (!normalized) return false
  if (SIPHON_NAMES_NORMALIZED.has(normalized)) return true
  // UniqueName 비교 (case-insensitive 로 통일).
  return normalized === SIPHON_UNIQUE_NAME.toLowerCase()
}

// 표시용 canonical 이름 — UI 빈 상태 안내 등에 사용. 서버 locale 과 무관.
export const SIPHON_CANONICAL_DISPLAY_NAME = 'Siphoned Energy'
