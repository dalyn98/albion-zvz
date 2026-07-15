# Albion Guild Manager

Albion Online ZvZ 길드 운영을 위한 멀티테넌트 SaaS. 이벤트 운영, 리기어 보상, 길드 상점, ZvZ 통계, Discord 자동화를 한 사이트에서 관리합니다.

- 프로덕션: <https://albion-guildmanager.com>
- 봇 초대 단축 URL: <https://albion-guildmanager.com/invite>
- 어드민용 사용법 가이드: 사이트 로그인 후 어드민 → 사용법 가이드 (i18n: ko / ja / en / zh)
- 마케팅·FAQ: `/`, `/pricing`, `/faq`

## 핵심 기능

- **이벤트 운영** — 파티 빌드 템플릿, 슬롯 배정, 봄스쿼드(자유 신청형) 파티, 일괄 출석 보상.
- **보상 자동화** — 자동 리기어(킬보드 기반·항상 pending), 이벤트 연동 수동 리기어(스크린샷), 자유 신청 리기어 윈도우, 길드 상점, 포인트 환전.
- **ZvZ 통계** — Albion `/battles` API 자동 집계, 멤버별 K/D·생존률·연속 출석·랭킹, 무기 카테고리별 사용 통계.
- **알비온 닉네임 인증** — 홈 길드 등록 후 멤버가 본인 닉을 인증하면 사이트·Discord 닉이 알비온 닉으로 자동 동기화.
- **Discord 통합** — OAuth 로그인, 채널 공지, 개인 DM 알림(이벤트 임박·보상 승인), 어드민 역할 매핑.
- **다국어** — `next-intl` 기반 ko / ja / en / zh 동등 지원, 어드민 전용 화면도 i18n 필수.

## 기술 스택

- **프레임워크**: Next.js 16 (App Router) on Vercel Fluid Compute
- **데이터**: Supabase (Postgres + RPC + RLS + Storage)
- **외부 API**: Albion gameinfo (3-region 폴링) + AODP 가격 API (5분 cron)
- **인증**: Discord OAuth (custom session, `next-auth` 미사용)
- **i18n**: `next-intl` v4
- **스타일**: Tailwind v4 + `lucide-react` 아이콘

## 로컬 개발

```bash
npm install
npm run dev:local                  # 로컬 Supabase/env/Test Auth 준비 + 0.0.0.0:3000
```

`dev:local`은 Docker의 로컬 Supabase만 사용하도록 `.env.local`을 갱신하고,
통합 테스트와 Test Auth용 member seed를 준비합니다. Discord 환경 변수는 실제
OAuth·봇 연동을 확인할 때만 필요하며 일반 개발과 인증 화면 테스트에는 필요 없습니다.

검증 명령:

```bash
npm run test:local                 # 단위 + 실제 로컬 DB 통합 테스트
npm run smoke:browser:local        # Test Auth member/admin 포함 Chromium smoke
```

빌드:

```bash
npm run build   # prebuild 단계에서 scripts/build-items 등 정적 자원 생성
npm start       # 프로덕션 모드 서버
npm run lint
```

### 필요한 환경 변수

| 변수 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 측 Supabase 접근 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 액션·cron 의 관리자 권한 접근 |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` / `DISCORD_PUBLIC_KEY` | 실제 OAuth·봇·slash command 검증용. 로컬 Test Auth 개발에서는 선택 |
| `COOKIE_SECRET` | 세션 쿠키 서명용 32자 랜덤 문자열 |
| `COOKIE_SECURE` | 프로덕션에서 `true`, 로컬 HTTP 에서 `false` |
| `APP_URL` | OAuth redirect base URL |
| `TENANT_ROOT_DOMAIN` | 멀티테넌트 서브도메인 라우팅 기준 |
| `CRON_SECRET` | Vercel Cron 및 수동 cron 호출 Bearer 토큰 |
| `ENABLE_TEST_AUTH` / `TEST_AUTH_SECRET` | 선택. 로컬/프리뷰에서 Discord OAuth 없이 테스트 세션을 발급할 때 사용. production 에서는 항상 비활성 |
| `TEST_SUPABASE_URL` / `TEST_SUPABASE_SERVICE_KEY` / `ALLOW_REMOTE_TEST_SUPABASE` | 로컬 DB 통합 테스트 전용. `npm run dev:setup`이 안전하게 구성 |
| `SUPER_ADMIN_DISCORD_IDS` / `SUPER_ADMIN_PATH` | 운영자 전용 임퍼소네이션 진입점 |
| `DISCORD_GUILD_ID` | 레거시 세션의 primary tenant fallback 용도. 신규 기능은 per-tenant DB 설정을 사용 |
| `GOOGLE_SEARCH_CONSOLE_SITE_URL` / `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` | 선택. Search Console URL-prefix 또는 Domain property 의 검색 성과 수집 |
| `GOOGLE_SITE_VERIFICATION` | 선택. Search Console URL-prefix HTML meta tag 인증용 verification token |
| `SUPABASE_ACCESS_TOKEN` | 선택. `./scripts/safe-db-push.sh` 의 pre-migration 백업 및 Supabase CLI 작업용 |

## 데이터베이스 마이그레이션

`supabase/migrations/` 에 번호 기반(`001_…`, `105_…`) 으로 누적합니다. 적용은 다음으로:

```bash
./scripts/safe-db-push.sh <label>
```

## 배포

`main` 브랜치에 push 하면 Vercel 이 자동으로 albion-guildmanager.com 에 프로덕션 배포합니다. PR 별 preview URL 도 자동 생성됩니다. 직접 `vercel deploy` 를 호출하지 않습니다.

## 디렉터리 개요

```
src/
  app/                     # App Router 라우트 (admin/, public/, api/, events/, battles/, regear/...)
  components/              # 공통 React 컴포넌트
  lib/                     # 도메인 로직, Supabase·Discord·Albion 클라이언트
  messages/                # ko.json · ja.json · en.json · zh.json (4개 언어 동등)
supabase/
  migrations/              # 누적 SQL 마이그레이션
scripts/                   # prebuild 단계의 정적 자원 빌드 스크립트
public/                    # 정적 자원
```

## 문의 / 버그 리포트

운영 중인 길드라면 사이트 어드민 화면 안내를 따라 직접 연락 주세요. 보안 이슈는 비공개 채널로 보고해 주세요.
