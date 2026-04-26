// Albion gameinfo (unofficial) API 의 지역별 base URL.
// killboard / killboard-sync / gameinfo / battles 4개 클라이언트가 같은 엔드포인트
// 맵을 각자 들고 있던 걸 한 곳으로 모았다 — Albion 이 도메인을 바꾸거나 새 지역
// 서버를 추가할 때 4곳 동시 수정 부담을 없앤다.
//
// AlbionServer 타입은 historical 이유로 albion-gameinfo.ts / killboard.ts 양쪽에
// 동일 정의가 export 돼 있어 import 경로가 둘로 갈라져 있다. 이 파일은 type 은
// 다루지 않고 endpoint 맵만 책임진다.

import type { AlbionServer } from '@/lib/albion-gameinfo'

export const ALBION_GAMEINFO_ENDPOINTS: Record<AlbionServer, string> = {
  west: 'https://gameinfo.albiononline.com/api/gameinfo',
  east: 'https://gameinfo-sgp.albiononline.com/api/gameinfo',
  europe: 'https://gameinfo-ams.albiononline.com/api/gameinfo',
}
