// AODP 관련 클라이언트·서버 공용 상수. 이 파일은 server-only 의존성이 없어야
// 한다 — 클라이언트 컴포넌트(AodpSettingsForm)가 안전하게 import 하므로.

// AODP `locations` 파라미터가 받는 공식 도시명. Black Market 은 매수 호가가
// 많아 sell_price_min 왜곡이 크므로 후보에서 제외.
export const AODP_ALLOWED_CITIES = [
  'Caerleon',
  'Bridgewatch',
  'Lymhurst',
  'Martlock',
  'Thetford',
  'Fort Sterling',
  'Brecilien',
] as const

export type AodpCity = (typeof AODP_ALLOWED_CITIES)[number]

export const AODP_CITY_LABEL_KEY: Record<AodpCity, string> = {
  Caerleon: 'aodpCity.caerleon',
  Bridgewatch: 'aodpCity.bridgewatch',
  Lymhurst: 'aodpCity.lymhurst',
  Martlock: 'aodpCity.martlock',
  Thetford: 'aodpCity.thetford',
  'Fort Sterling': 'aodpCity.fortSterling',
  Brecilien: 'aodpCity.brecilien',
} as const
