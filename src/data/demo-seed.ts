// 데모 페이지 (`/demo/*`) 의 인라인 시드 데이터.
// 4 라우트 (dashboard, events, regear, members, stats) 를 read-only 로 채운다.
// 모든 데이터는 build-time 상수 — 사용자 인터랙션이 mutation 하지 않는다.
//
// i18n: 번역 가능한 라벨은 enum 키로 보관 (role/achievement/slotRole/day),
// 렌더 타임에 next-intl 로 풀어 사용. 고유명사 (IGN, 도시, 게임 아이템) 는 raw.
//
// 이 파일은 barrel — 실제 데이터는 ./demo-seed/<entity>.ts 에 분리되어 있다.
// 기존 consumer 의 `@/data/demo-seed` import path 를 유지하기 위함.

export * from './demo-seed/shared'
export * from './demo-seed/members'
export * from './demo-seed/events'
export * from './demo-seed/regear'
export * from './demo-seed/approvals'
export * from './demo-seed/stats'
export * from './demo-seed/kills'
