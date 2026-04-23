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

// 도시 한글 표시명. 관리자 설정과 /shop 에 표기 공통.
export const AODP_CITY_LABEL: Record<AodpCity, string> = {
  Caerleon: '카에르레온',
  Bridgewatch: '브리지워치',
  Lymhurst: '림허스트',
  Martlock: '말록',
  Thetford: '테트포드',
  'Fort Sterling': '포트 스털링',
  Brecilien: '브레실리엔',
}

// AODP 설명 툴팁 — 관리자/길드상점 공용. "왜 부정확할 수 있는가" 에 초점.
// 기준 도시 설정 옆, /shop 헤더 옆 Info 아이콘에 호버 툴팁으로 달린다.
export const AODP_INFO_TOOLTIP =
  'AODP(Albion Online Data Project)는 유저가 게임 클라이언트에서 수집한 시세를 공유하는 크라우드소싱 API입니다. 서버·도시·시간대별 데이터 밀도가 달라, 설정 기준 도시에 최근 시세가 없으면 자동으로 낮은 품질 → 14일 평균 → 다른 로열 시티 → 레드존 순으로 폴백해 추정합니다. 폴백이 발생하면 실제 거래 가치와 차이가 날 수 있어 "시세 부정확" 경고가 표시됩니다.'
