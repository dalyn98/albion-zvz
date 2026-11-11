# Albion Guild Manager

Albion Online ZvZ 길드 운영을 위한 멀티테넌트 SaaS. 이벤트 운영, 리기어 보상, 길드 상점, ZvZ 통계, Discord 자동화를 한 사이트에서 관리합니다.

> **운영 상태:** 2026년 10월 서비스 운영을 중단했습니다. 이 저장소는 개발 과정과 구현 사례를 보존한 포트폴리오 자료이며, 2026년 11월 12일부터 공개되어 있습니다. 아래의 기능·설정·배포 설명은 개발 및 운영 당시의 구조를 설명합니다.

- [공개 프로젝트 소개](https://hyeonwoo-product-portfolio.dalyn8690.chatgpt.site/projects/albion/)
- [주요 기능과 화면](https://hyeonwoo-product-portfolio.dalyn8690.chatgpt.site/projects/albion/features)
- [개발 과정과 검증 근거](https://hyeonwoo-product-portfolio.dalyn8690.chatgpt.site/projects/albion/evidence)
- [시작 후 참가 허용 개선](https://github.com/dalyn98/albion-zvz/commit/19f3fd7e75002d410f23001fc0c7b4209e8da000)
- [보상 기준 누락 개선](https://github.com/dalyn98/albion-zvz/commit/5dfa4f52000df103742d338cad6aeb404bf14d5e)

과거 운영 도메인은 `albion-guildmanager.com`입니다. 현재 서비스 이용이나 봇 초대 주소로 안내하지 않습니다. 공개 자료 페이지는 제품과 개발 기록을 소개하며, 운영 중인 SaaS 체험 페이지는 아닙니다.

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
cp .env.local.example .env.local   # 시크릿 채우기
npm run dev                        # 0.0.0.0:3000
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
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` / `DISCORD_BOT_TOKEN` / `DISCORD_PUBLIC_KEY` | OAuth 로그인 + 봇 동작 + slash command 서명 검증 |
| `DISCORD_SUPPORT_GUILD_ID` | 선택. 공식 지원 서버 한 곳에서만 `/support` 티켓 기능과 멱등형 서버 구성을 활성화 |
| `SUPPORT_CODEX_ENABLED` / `CODEX_WORKER_SECRET` | 공식 지원 티켓의 owner-only Codex dispatch 활성 여부와 Vercel↔로컬 워커 HMAC secret. secret은 32자 이상 별도 값 사용 |
| `CODEX_WORKER_BASE_URL` / `CODEX_WORKER_REPO_PATH` | 로컬 Codex 워커가 호출할 배포 URL과 저장소 절대 경로. URL은 로컬 외 환경에서 HTTPS 필수 |
| `CODEX_WORKER_WORKTREE_ROOT` / `CODEX_WORKER_TIMEOUT_MS` / `CODEX_WORKER_ID` | 선택. 격리 worktree 위치, 1~60분 실행 제한, 워커 식별자 |
| `SUPPORT_AI_MODEL` | 선택. 직원용 티켓 분류 모델. 기본값은 Vercel AI Gateway의 `openai/gpt-5.4-nano` |
| `COOKIE_SECRET` | 세션 쿠키 서명용 32자 랜덤 문자열 |
| `COOKIE_SECURE` | 프로덕션에서 `true`, 로컬 HTTP 에서 `false` |
| `APP_URL` | OAuth redirect base URL |
| `TENANT_ROOT_DOMAIN` | 멀티테넌트 서브도메인 라우팅 기준 |
| `CRON_SECRET` | Vercel Cron 및 수동 cron 호출 Bearer 토큰 |
| `ENABLE_TEST_AUTH` / `TEST_AUTH_SECRET` | 선택. 로컬/프리뷰에서 Discord OAuth 없이 테스트 세션을 발급할 때 사용. production 에서는 항상 비활성 |
| `SUPER_ADMIN_DISCORD_IDS` / `SUPER_ADMIN_PATH` | 운영자 전용 임퍼소네이션 진입점 |
| `DISCORD_GUILD_ID` | 레거시 세션의 primary tenant fallback 용도. 신규 기능은 per-tenant DB 설정을 사용 |
| `GOOGLE_SEARCH_CONSOLE_SITE_URL` / `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` / `GOOGLE_OAUTH_REFRESH_TOKEN` | 선택. Search Console URL-prefix 또는 Domain property 의 검색 성과 수집 |
| `GOOGLE_SITE_VERIFICATION` | 선택. Search Console URL-prefix HTML meta tag 인증용 verification token |
| `AGM_EVENT_RENDER_SNAPSHOT_CACHE_DISABLED` | 선택. 이벤트 렌더 스냅샷 캐시 비상 우회. 정확히 `true` 일 때만 비활성화 |
| `SUPABASE_ACCESS_TOKEN` | 선택. `./scripts/safe-db-push.sh` 의 pre-migration 백업 및 Supabase CLI 작업용 |

공식 지원 서버는 `support-tickets` cron이 채널·역할·영문 안내·권한·패널을 멱등하게
구성합니다. 봇에는 서버 수준 `Manage Channels`, `Manage Roles`, `Manage Guild`와 티켓용
`View Channels`, `Send Messages`, `Create Private Threads`, `Send Messages in Threads`,
`Manage Threads` 권한이 필요합니다. 일상적인 상담은 사람이 수행하며 AI는 초기 티켓의
직원용 분류·요약·위험 신호만 생성합니다. AI 장애나 예산 초과는 티켓 생성과 상태 변경을
막지 않습니다. 운영 진단은 `/support health`, 패널 복구는 `/support sync`를 사용합니다.

### Discord Codex 티켓 컨트롤

`support-tickets` cron은 공식 지원 서버의 비공개 `🧠・codex-control` 채널과
버튼 패널도 멱등하게 구성합니다. 이 채널과 모든 interaction은 Discord ID
`490294888605155339`만 허용합니다. 패널에서 티켓과 조사/구현 모드를 고르고
요청을 입력한 뒤 `실행 승인`을 눌러야 작업이 큐에 들어갑니다.

Codex는 Vercel 함수 안에서 실행하지 않습니다. 저장소와 Codex 로그인이 준비된
로컬 머신의 **전용 OS 계정**에서 다음 워커를 실행합니다. 이 계정에는 운영 `.env`,
SSH 키, 배포 자격 증명, 다른 저장소 읽기 권한을 주지 않습니다. 티켓 본문은 secret
패턴과 URL query를 제거한 뒤 전달되지만, 사용자 입력이므로 별도 계정 경계가 필요합니다.

```bash
cp .env.codex-worker.example .env.codex-worker
# 배포 URL과 저장소 경로를 입력. macOS에서는 HMAC secret을 Keychain에서 읽습니다.
npm run worker:codex
```

워커는 승인된 작업만 HMAC 인증으로 가져오며 모든 모드를 별도 git worktree에서
실행합니다. 조사 모드는 read-only, 구현 모드는 workspace-write입니다. 어느 모드도
commit, push, 배포, 운영 마이그레이션 적용 또는 사용자 자동 답변을 허용하지 않습니다.
조사 worktree는 종료 후 자동 제거하고, 구현 worktree는 검토를 위해 보존합니다.
기본 보존 경로는 저장소와 같은 부모 디렉터리의 `.<저장소명>-codex-worktrees`입니다.
`/support health`에서 secret 구성, 전용 채널, 패널, 최근 워커 heartbeat를 함께 확인합니다.

## 데이터베이스 마이그레이션

`supabase/migrations/` 에 번호 기반(`001_…`, `105_…`) 으로 누적합니다. 적용은 다음으로:

```bash
./scripts/safe-db-push.sh <label>
```

## 운영 당시의 배포 방식

운영 당시에는 `main` 브랜치 push를 Vercel 프로덕션 자동 배포와 연결하고, PR별 preview URL을 사용했습니다. 직접 `vercel deploy`를 호출하지 않는 방식이었습니다. 이 설명은 현재 서비스가 운영 중이라는 뜻이 아닙니다.

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

서비스 운영은 종료되었습니다. 공개 코드와 문서에 관한 질문은 GitHub Issues에 남길 수 있습니다. 비밀키, 계정 정보 또는 이용자 개인정보는 공개 이슈에 포함하지 마세요.
