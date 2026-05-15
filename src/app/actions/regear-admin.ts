// 리기어/환전/역할보상 어드민 액션 배럴. 호출부 (@/app/actions/regear-admin)
// 호환을 위해 경로 유지. 구현은 5-way 분리:
//
// - regear-admin-types.ts    순수, types + 상수 + 공통 helper
// - regear-admin-list.ts     'use server', 조회/검색/이상치 감지
// - regear-admin-resolve.ts  'use server', approve/reject/recheck/bulk
// - exchange-admin.ts        'use server', 환전 + 역할 보상
//
// 클라이언트 컴포넌트가 이 배럴에서 `'use server'` 모듈의 함수만 import 하도록
// 디자인 — Turbopack 가 RPC 스텁으로 치환해 next/headers 가 클라 번들에 끌려
// 오지 않게 한다. 비-action 헬퍼 (`getRegearPayoutRatePercent` 등) 는 서버
// 컴포넌트가 `@/app/actions/regear-admin-types` 에서 직접 import.

export type {
  AdminRegearRequest,
  AdminExchangeRequest,
  RoleReward,
  RegearOrigin,
  RegearOriginCounts,
  BulkRegearActionResult,
  RecheckKillboardResult,
} from './regear-admin-types'

export {
  listRegearRequests,
  getRegearOriginCounts,
  getScreenshotUrl,
  getRegearAnomalyMap,
} from './regear-admin-list'

export {
  approveRegearRequest,
  approveRegearFromStock,
  approveRegearAsCrafted,
  recheckKillboardVerification,
  bulkApproveRegear,
  rejectRegearRequest,
} from './regear-admin-resolve'

export {
  listExchangeRequests,
  approveExchangeRequest,
  rejectExchangeRequest,
  listRoleRewards,
  updateRoleReward,
} from './exchange-admin'
