# 전체 기능 점검/보완 보고서

작업일: 2026-06-01

## 한눈에 보기

이번 작업은 제작 기능만이 아니라 앱 전체 기능군을 기준으로 점검했습니다.

- 공개 랜딩/기능 소개와 실제 앱 기능 설명을 맞췄습니다.
- 빌드표 모집 기능이 마케팅 화면에서도 보이도록 스크린샷 슬롯과 기본 이미지를 추가했습니다.
- 제작 리기어 설명에서 실제 구현과 다른 "자재/재료 BoM 자동 집계" 표현을 제거했습니다.
- 데모 화면, 사이드바, 임퍼소네이션 배너, 리기어 검증 메모의 하드코딩/번역 누락을 보완했습니다.
- 관리자/cron/test API의 권한 가드를 다시 확인했습니다.
- `npm audit` 취약점 2건을 lockfile 업데이트로 0건으로 정리했습니다.

## 점검한 기능 범위

- 온보딩/로그인/Discord OAuth/봇 설치
- 멀티테넌트 세션, 테넌트 해석, 테스트 인증 차단 조건
- 이벤트 생성/편집/발행/게스트/임시 신청/파티 슬롯
- 빌드표 모집, 빌드 템플릿, 이벤트 빌드 팔레트
- 리기어: 수동 신청, 자동 리기어, 자유 신청 창구, 검증 재확인
- 제작 리기어: 제작 큐, 내 작업, 발주, 납품 박스, 재고 연결
- 상점/포인트/환전/재고/기부/출고
- 통계/전투/킬보드/리더보드/무기 통계
- 멤버/알비온 인증/로컬 길드 계정/공개 길드 프로필
- 관리자 설정/권한/감사 로그/백업/진단
- 공개 마케팅 페이지, 기능 소개, 가격/FAQ/데모 화면
- API/cron/super-admin 운영 경로

## 수정한 내용

### 1. 마케팅 페이지와 실제 기능 동기화

- 랜딩의 6번째 기능을 `빌드표 모집`으로 연결했습니다.
- 마케팅 스크린샷 슬롯에 `builds`를 추가했습니다.
- `/demo/builds` 화면을 기반으로 기본 이미지 `public/screenshots/builds-demo.png`를 추가했습니다.
- 마케팅 스크린샷 캐시 키를 갱신해 기존 5개 슬롯 캐시가 남아도 새 슬롯이 누락되지 않게 했습니다.
- 스크린샷 carousel이 이미지 배열을 못 받을 때도 런타임 에러 없이 빈 배열로 처리되게 했습니다.

관련 파일:
- `src/lib/marketing-screenshots.ts`
- `src/components/MarketingScreenshotCarousel.tsx`
- `src/app/public/(marketing)/landing/page.tsx`
- `src/app/super-admin/marketing-screenshots/page.tsx`
- `public/screenshots/builds-demo.png`
- `supabase/migrations/177_marketing_screenshot_builds_slot.sql`

### 2. 제작 리기어 설명 정정

실제 제작 큐는 "완제품 장비 수량/재고 확인" 중심인데, 일부 문구가 "자재 BoM/재료 자동 집계"처럼 더 넓은 기능으로 표현되어 있었습니다.

- 공개 기능 소개 문구 수정
- 제작 큐/내 작업/데모 문구 수정
- 같은 문제가 다시 들어오지 않도록 메시지 테스트 추가

관련 파일:
- `src/messages/{ko,en,ja,zh}.json`
- `src/messages/craft-copy.test.ts`

### 3. 데모 화면 하드코딩/번역 보완

- 제작 데모의 역할 라벨을 메시지 키로 분리했습니다.
- 데모 길드 프로필 설명 샘플을 4개 locale 메시지로 옮겼습니다.
- 데모 템플릿 요약 문구와 삭제 aria-label을 i18n으로 교체했습니다.

관련 파일:
- `src/app/demo/craft/queue/page.tsx`
- `src/app/demo/craft/my-tasks/page.tsx`
- `src/app/demo/guild-profile/page.tsx`
- `src/app/demo/_components/DemoTemplateList.tsx`

### 4. 앱 공통 UI 번역 보완

- 슈퍼어드민 메뉴 라벨을 메시지 키로 분리했습니다.
- 사이드바의 슈퍼어드민 그룹명을 번역했습니다.
- 임퍼소네이션 배너 문구를 4개 locale로 번역했습니다.

관련 파일:
- `src/components/AppSidebar.tsx`
- `src/components/ImpersonationBanner.tsx`
- `src/messages/{ko,en,ja,zh}.json`

### 5. 리기어/킬보드 검증 메모 다국어화

리기어 신청과 관리자 재확인에서 `admin_notes`에 저장되는 킬보드 검증 실패 사유가 한국어로 고정되어 있었습니다.

- `verifyDeathInWindow()`가 구조화된 reason code를 반환하도록 보완했습니다.
- 신청/재확인 액션에서 현재 locale 메시지로 포맷해 저장하도록 변경했습니다.
- 수동 리기어가 자동 리기어를 대체할 때 남기는 메모도 locale 메시지로 변경했습니다.
- 포맷 헬퍼 테스트를 추가했습니다.

관련 파일:
- `src/lib/killboard.ts`
- `src/lib/killboard.test.ts`
- `src/app/actions/regear.ts`
- `src/app/actions/regear-admin-resolve.ts`
- `src/messages/{ko,en,ja,zh}.json`

### 6. 마케팅 이미지 관리 액션 오류 메시지 번역

마케팅 스크린샷 업로드/삭제/정렬 액션의 사용자 노출 오류가 한국어 고정값이었습니다.

- 잘못된 슬롯, 파일 누락, 용량 초과, 타입 오류, 업로드 실패, 정렬 대상 누락 등을 `publicMarketing` 메시지로 이동했습니다.
- 4개 locale parity를 맞췄습니다.

관련 파일:
- `src/app/actions/marketing-screenshots.ts`
- `src/messages/{ko,en,ja,zh}.json`

### 7. 보안 취약점 정리

`npm audit`에서 moderate 2건이 확인되었습니다.

- `brace-expansion` 5.0.5 → 5.0.6
- `ws` 8.20.0 → 8.21.0
- `package-lock.json`만 갱신됐고, `npm audit --audit-level=moderate` 기준 0 vulnerabilities 상태입니다.

## 멀티테넌트/권한 점검 결과

- `/api/admin/*` 운영성 엔드포인트는 슈퍼어드민 세션 또는 cron secret으로 제한되어 있음을 확인했습니다.
- `/api/cron/*` 경로는 `CRON_SECRET` 또는 `withCronRun()`으로 보호되어 있음을 확인했습니다.
- `/api/test/auth/session`은 `VERCEL_ENV=production`에서 비활성화됩니다.
- Discord interactions는 Discord signature 검증 경로로 분리되어 있습니다.
- 공개 API로 남아야 하는 항목은 health, item search/spells, OAuth start/callback 계열입니다.
- 이번 코드 수정은 기존 `guild_id` 필터와 tenant scope를 제거하지 않았습니다.

## DB/배포 주의사항

새 마이그레이션 파일은 추가했지만 적용하지 않았습니다.

운영 DB에 `builds` 마케팅 스크린샷 슬롯을 쓰려면 배포 전 별도 지시 후 아래 명령으로 적용해야 합니다.

```bash
./scripts/safe-db-push.sh marketing-screenshot-builds-slot
```

## 검증 결과

- `npx --no-install tsc --noEmit --skipLibCheck`: 통과
- `npm run lint`: 통과
- `npm test`: 99 files / 743 tests 통과
- `npm run test:integration`: 1 file / 13 tests skip
  - 로컬 통합 DB env가 없어서 자동 skip된 상태입니다.
- i18n parity: 4개 locale 5510 keys 동등
- `npm run build`: 통과
- `npm audit --audit-level=moderate`: 0 vulnerabilities
- `git diff --check`: 통과
- 브라우저 확인:
  - `/public/landing?prodCheck=1#features`
  - `/demo/builds`
  - `/demo/craft/my-tasks`

## 남아 있는 확인 사항

- 통합 테스트는 `TEST_SUPABASE_URL` / `TEST_SUPABASE_SERVICE_KEY`가 있는 환경에서 다시 실행하면 실제 DB invariant까지 확인할 수 있습니다.
- 작업 전부터 존재하던 별도 변경/미추적 파일은 되돌리지 않았습니다.
  - 예: `src/components/EventPartyGrid.tsx`, `src/lib/event-party-grid.ts`, `src/lib/event-party-grid.test.ts`, 일부 이미지/JSON 작업 파일

## 5축 체크

- 코드: 마케팅/데모/리기어/킬보드/공통 UI 변경을 좁은 범위로 적용했습니다.
- 타입: TypeScript 검사 통과.
- 테스트: 단위 테스트 전체 통과, 메시지/킬보드 테스트 보강.
- i18n: ko/en/ja/zh key parity 통과, 신규 노출 문구 4개 locale 반영.
- DB/보안: 새 마이그레이션은 파일만 추가, 미적용. API 권한 가드와 audit 취약점 상태 확인 완료.
