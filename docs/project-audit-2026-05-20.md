# Albion Guild Manager 인수인계 감사 1차

작성일: 2026-05-20  
범위: Claude Code 대화 export 4개, 현재 코드/라우트/API/마이그레이션/i18n/빌드/테스트

## 감사 기준

- 사용자는 비개발자 길드 운영자다. 기능은 "설명 없이도 다음 행동이 보이는가" 를 기준으로 본다.
- self-serve 기준은 "새 길드가 Discord OAuth 로 봇을 초대하고, 별도 SQL/env 수동 우회 없이 멘헤라와 동등하게 운영 가능한가" 다.
- #17 chest log paste-import 와 #19 war role loadout validation 은 사용자 지시대로 이번 감사 판단에서 제외한다.
- Telegram 연동은 Codex 앱 사용으로 대체되므로 이번 제품 범위에서 제외한다.

## 현재 기능 표면

### 공개/마케팅

- `/public/landing`, `/public/features`, `/public/pricing`, `/public/faq`
- `/public/docs/*` 운영 문서
- `/public/g/[slug]` 길드 공개 프로필
- `/demo/*` 실제 앱 톤을 따라 만든 read-only 데모 라우트
- `/super-admin/marketing-screenshots` 를 통한 마케팅 스크린샷 관리

상태: 데모 라우트와 공개 문서는 충분히 넓다. 다만 로컬 `public/screenshots` 는 비어 있고, 랜딩에는 일부 placeholder 문구가 남아 있어 외부 마케팅 전에는 실제 스크린샷/영상 보강이 필요하다.

2026-05-20 Codex 인수 후 보완: 모바일 인앱 브라우저에서 Discord OAuth 가 깨지는 리스크를 줄이기 위해 기존 AppGate 안내를 `/admin` 로그인과 공개 랜딩 CTA 에도 재사용했다. 카카오톡/Discord/Instagram/Facebook/LINE/Naver/WeChat 인앱 브라우저 감지 시 외부 브라우저 열기/URL 복사 안내가 표시된다.

### 온보딩/멀티테넌트

- `/onboard` 봇 설치 대상 Discord 길드 선택
- `/onboard/setup/[id]/*` slug, 역할, Albion 홈 길드, 보상 정책 설정
- tenant slug/subdomain 라우팅
- Discord OAuth callback 에서 기존 멤버와 신규 onboarding 분기
- `listActiveTenants()` 기반 cron per-tenant 순회

상태: 대화 기록상 self-serve 구조는 이미 구축되어 있고, 코드도 per-tenant DB 설정을 사용한다. 다만 과거 운영 리포트에 pending tenant 가 24h+ 머문 사례가 있어 신규 길드 첫 30분 funnel 은 실제 계정으로 재검증해야 한다.

### 멤버 기능

- 홈 이벤트 목록/참가
- 이벤트 상세, 파티/슬롯 신청, 게스트 이벤트 링크
- `/me` 잔액, 전적, 요청, 환전, 포인트 이전, 기부
- `/me/settlements` 월말 정산 라인과 개인별 청구/수취 금액 확인
- `/regear`, `/me/regear/[id]` 수동/자동 리기어 청구와 가격 수정
- `/shop` 길드 상점
- `/craft/queue`, `/craft/my-tasks`, `/craft/orders`, `/craft/inventory`
- `/members`, `/members/[discordId]`, `/members/albion/[playerId]`
- `/battles`, `/battles/[id]`, `/leaderboard`

상태: 기능 범위는 넓고, 포인트 잔액/청구/제작/전투 통계가 연결되어 있다. Codex 인수 후 월말 마감/CSV/개인별 청구서 v1 도메인 객체를 추가했다.

### 관리자 기능

- `/admin/dashboard` 운영 현황
- approvals 통합 승인: 리기어/환전/기부/상점/이벤트 지급/제작
- 이벤트/템플릿/파티/슬롯 편집
- 리기어 윈도우, 자동 리기어, 제작 리기어
- 길드 상점, 재고, baseline, AODP 가격
- 멤버/통계/탈퇴자/알비온 인증 관리
- 길드 프로필/갤러리/YouTube
- 백업 export/import
- 월말 정산 생성/마감/CSV
- granular permission
- admin audit log
- siphon ledger

상태: 관리자용 기능은 풍부하지만, 일부 고급 기능은 일반 길드 운영자가 이해하기 어렵다. 이번 작업에서 관리자 홈에 운영 패널을 추가해 "다음에 뭘 해야 하는지" 를 보강했다.

### 백그라운드/통합

- Vercel cron: battle tracker, killboard sync, auto regear, event imminent, Albion roster sync, member sync, cleanup, craft expire, shop price sync
- Discord OAuth, bot invite, channel message, DM, slash command verification
- Supabase Storage: 리기어/기부/공지/프로필/마케팅 이미지
- Supabase Realtime broadcast: killboard push
- Sentry optional

상태: cron 은 per-tenant 순회 구조다. `/api/admin/*backfill|*debug|*diagnose` 계열 중 세션 기반 엔드포인트는 2026-05-20에 super-admin 전용으로 격상했다. `battle-matchup-backfill` 은 `CRON_SECRET` Bearer 전용이라 일반 길드 관리자 세션으로는 호출되지 않는다.

## 반영한 수정

1. 관리자 홈 운영 패널 추가
   - 승인 대기, 필수 설정 누락, 동기화 지연, 미인증 멤버, 다음 액션 표시
   - 4 locale i18n 추가

2. 비어드민 담당관 admin route 접근 보완
   - `CAP.SIPHON_MANAGE`, `CAP.AUDIT_VIEW`, `CAP.SETTINGS_PERMISSIONS` 기반 route access helper 추가
   - proxy, sidebar, audit page, permissions page, permissions actions 에 capability gate 적용
   - `/admin` 진입 시 담당관을 admin-only dashboard root 가 아니라 첫 접근 가능 화면으로 redirect
   - `/admin/dashboard/guide` 의 내부 `requireAdmin()` 재차단 제거
   - route access 단위 테스트 추가

3. 문서 드리프트 수정
   - i18n 기준을 ko/en/ja/zh 로 정리
   - README 의 storage 설명을 Supabase Storage 로 정정
   - env example 에 Discord/Cron/Tenant/Super-admin/Supabase token 항목 보강
   - legacy `DISCORD_EVENT_CHANNEL_ID` 주석 제거

4. 기존 lint 경고 제거
   - demo me page 의 unused constant 제거

5. 모바일 Discord 로그인 안내 보강
   - 기존 보호 게이트의 인앱 브라우저 안내를 `/admin` 로그인과 공개 랜딩 CTA 에도 재사용
   - 카카오톡/Discord/Instagram/Facebook/LINE/Naver/WeChat 인앱 브라우저 감지 시 외부 브라우저/URL 복사 안내 표시

6. 길드원 self-service UX 보강
   - `/me` 상단에 "지금 확인할 것" 패널 추가: 캐릭터 인증, 대기 신청, 다음 이벤트, 월말 정산을 우선 노출
   - `/me/requests` 상단에 리기어/환전/기부별 대기/전체 요약 추가
   - `/me/settlements` 상단에 최신 정산 결과 요약 추가: 받을 금액, 낼 금액, 변동 없음, 초안/마감 안내

7. 소통 채널 정리
   - Telegram 채널/Telegram 알림은 더 이상 사용하지 않는다.
   - 사용자 소통과 완료 보고는 ChatGPT Codex 앱 기준으로 한다.

## 주요 발견

### P0. 월말 정산/CSV/개인별 청구

초기 점검 시점에는 `point_ledger` 와 잔액 계산은 탄탄했지만 "정산 기간" 이 없었다. `getFinanceFlowStats()` 는 최근 30일 흐름을 보여주는 통계일 뿐, 마감/동결/CSV/청구 상태를 만들지 않았다.

2026-05-20 Codex 인수 후 v1 구현:

- `155_monthly_settlements.sql`: `settlement_periods`, `settlement_lines` 추가
- 관리자 화면: `/admin/dashboard/settlements`, `/admin/dashboard/settlements/[id]`
- 멤버 화면: `/me/settlements`
- CSV 다운로드: 브라우저에서 현재 정산 라인 기준 생성
- 감사 로그: `settlement.create`, `settlement.close`

남은 제품 단위:

- 재계산/수정 흐름: draft 기간을 삭제 없이 다시 계산할지 정책 결정 필요
- export 이력: CSV 다운로드 자체를 서버에 기록할지 결정 필요
- 실제 지급 완료 처리: 월말 정산과 기존 환전 승인 플로우를 연결할지 결정 필요

### P1. granular permission 은 기반만 있고 전체 적용은 아니다

권한 비트필드와 UI는 존재한다. 하지만 대부분 admin server action 은 아직 `requireAdmin()` 또는 `session.isAdmin` 이다. 현재 capability 로 열린 것은 이번에 보완한 siphon/audit/permissions, 그리고 Codex 인수 후 추가한 stats/settlements 중심이다.

2026-05-20 Codex 인수 후 추가 보완:

- `STATS_VIEW`: 통계 화면과 `stats-admin` read actions 접근
- `SETTLEMENT_MANAGE`: 월말 정산 화면과 정산 생성/마감 actions 접근
- 담당관 `/admin` 진입 redirect 와 운영 가이드 접근 차단 불일치 수정
- 기존 admin 세션은 새 capability bit 가 쿠키에 없어도 `isAdmin` fallback 으로 통과

다음 단계는 기능별 matrix 가 필요하다.

- regear approve/edit/bulk
- shop inventory/pricing/order review
- craft master/deliver/order review
- members view/manage
- event manage/create category
- settings/profile/toggles
- audit view

### P1. 관리자 진단/백필 API 가 제품 표면에 남아 있다

다음 라우트는 운영용이지만 상시 route 로 존재한다.

- `/api/admin/auto-regear-backfill`
- `/api/admin/auto-regear-debug`
- `/api/admin/auto-regear-list`
- `/api/admin/killboard-backfill-battle-id`
- `/api/admin/killboard-backfill-equipment`
- `/api/admin/stats-diagnose`
- `/api/admin/battle-matchup-backfill`

2026-05-20 Codex 인수 후 세션 기반 엔드포인트는 super-admin 전용으로 격상했다. `battle-matchup-backfill` 은 기존처럼 `CRON_SECRET` Bearer 전용이다.

남은 보완:

- 라우트 경로를 `/api/super-admin/*` 또는 CLI script 로 이름까지 정리할지 결정
- super-admin UI 에서 안전한 버튼/로그 뷰로 감싸 직접 URL 호출 필요성을 줄이기

### P1. 신규 길드 첫 경험 검증이 필요하다

코드상 self-serve 는 준비되어 있지만, 과거 운영 리포트에 pending tenant 정체가 있었다. 외부 마케팅 전에는 실제 신규 Discord test guild 로 아래를 끝까지 확인해야 한다.

2026-05-20 Codex 인수 후 보완: 봇 설치자로 확정된 tenant owner 는 Discord 관리자 역할 선택을 잘못해도 다음 로그인에서 `isAdmin=true` 와 전체 capability 를 유지하도록 수정했다. 비개발자 운영자가 온보딩 중 관리자 역할을 잘못 고른 뒤 세션 만료로 잠기는 self-lockout 을 막기 위한 안전장치다.

- landing/demo 에서 봇 설치 시작
- canonical domain callback
- setup wizard 완료
- subdomain admin dashboard 진입
- 첫 이벤트 생성
- 멤버 로그인/Albion 인증
- 첫 리기어/상점/제작 중 하나 실행

### P2. 통합/E2E 테스트가 부족하다

현재 `npm test` 는 좋고 빠르다. 하지만 `npm run test:integration` 은 로컬 DB env 없으면 skip 이며, Playwright E2E script 가 없다.

권장 smoke:

- guest/member/admin/super-admin auth routing
- onboarding wizard
- admin dashboard
- event create/edit/publish
- slot signup/cancel
- regear submit/approve
- shop order/approve
- craft queue claim/deliver
- mobile sidebar

### P2. 마케팅 자산이 부족하다

데모는 존재하지만, 랜딩의 실제 제품 스크린샷/30초 자동 리기어 영상/가격 정책 문구가 아직 약하다. 비개발자 길드장은 코드 품질보다 "우리 길드에 바로 쓸 수 있나" 를 먼저 본다.

### P2. 대형 파일이 많다

500줄 이상 TS/TSX 파일이 다수다. 당장 결함은 아니지만 정산 기능처럼 공유 도메인이 생기면 유지보수 비용이 커진다.

우선 분리 후보:

- finance/settlement 도메인 신설
- admin permission matrix
- regear admin actions
- shop import/baseline
- craft orders/queue

### P3. 서비스 역할 전용 RLS 전략은 의도는 맞지만 테스트로 보강해야 한다

migration 118 이 모든 public table 에 RLS 를 켜고 정책 없이 service-role 전용으로 둔다. 현재 앱 구조에서는 맞는 전략이다. 다만 새 테이블 추가 시 RLS 누락과 guild_id 누락은 통합 테스트로 잡는 것이 안전하다.

## 다음 구현 순서

1. 월말 정산 v1 운영 검증
   - 신규 마이그레이션 적용 후 실제 guild ledger 로 기간 생성/CSV/멤버 화면을 확인한다.

2. admin diagnostics/backfill UX 정리
   - 권한은 super-admin/CRON_SECRET 으로 격리됐다. 다음은 route 이름과 super-admin UI 를 정리한다.

3. permission matrix 확장
   - route access helper 를 기준으로 stats/settlements 는 capability 기반으로 전환했다.
   - 남은 shop/regear/member/settings/admin-team action 도 기능별 capability 로 분리한다.

4. 신규 tenant E2E smoke
   - 실제 Discord test guild 로 self-serve 조건을 검증한다.
   - 관리자 역할 오선택 후 재로그인해 owner 가 잠기지 않는지도 포함한다.

5. 마케팅 자산 보강
   - 자동 리기어/제작 리기어/통계/멤버 정보/이벤트 편집 중심으로 이미지와 짧은 영상.

6. Playwright smoke 추가
   - 비개발자 사용자 동선과 모바일 nav 를 회귀 방지한다.
