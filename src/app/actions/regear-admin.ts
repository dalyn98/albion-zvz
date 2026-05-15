// 리기어/환전/역할보상 어드민 액션 배럴. 호출부 (@/app/actions/regear-admin)
// 호환을 위해 경로 유지. 구현은 5-way 분리:
//
// - regear-admin-types.ts    순수, types + 상수 + 공통 helper
// - regear-admin-list.ts     'use server', 조회/검색/이상치 감지
// - regear-admin-resolve.ts  'use server', approve/reject/recheck/bulk
// - exchange-admin.ts        'use server', 환전 + 역할 보상

export type {
  AdminRegearRequest,
  AdminExchangeRequest,
  RoleReward,
  RegearOrigin,
  RegearOriginCounts,
  BulkRegearActionResult,
  RecheckKillboardResult,
} from './regear-admin-types'

export { getRegearPayoutRatePercent } from './regear-admin-types'

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
