<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Albion Guild Manager — Agent Rules

Multi-tenant SaaS for Albion Online ZvZ guild operations. Production: <https://albion-guildmanager.com>.

> 일반 프로젝트 개요·로컬 개발·env 표는 [README.md](./README.md) 를 참고하세요. 이 문서는 코드를 만지는 AI 에이전트가 알아야 하는 "암묵 규칙" 만 모았습니다.

## 핵심 컨벤션 / hard rules

1. **다국어 필수** — `src/messages/{ko,ja,en}.json` 은 항상 키가 동등해야 한다. 어드민 전용 화면도 ja/en 까지 동일하게 작성. 하드코딩된 한국어 라벨/placeholder 금지. **예외:** `/super-admin/*` (운영자 본인 전용, 외부 path 로 숨김 처리되어 있음) 는 ko 단일언어 허용 — `useTranslations()` 없이 한국어 리터럴 사용 가능.
2. **`export const dynamic = 'force-static'` 금지** — 빌드타임에 layout 의 `x-pathname` 헤더가 비어 AppGate 가 HTML 에 박혀버린다. 새 라우트는 `force-dynamic` 또는 ISR 로 둘 것.
3. **RSC → Client 컴포넌트에 `t()` 함수 prop 으로 넘기지 말 것** — 배포 후 500 가능. Server 측에서 미리 string 으로 풀어 prop 으로 넘기거나, Client 측에서 `useTranslations()` 를 직접 호출.
4. **Supabase 마이그는 번호 누적** — `supabase/migrations/<3자리>_<설명>.sql` 형태로만 추가. 적용은 `supabase db push --linked`.
5. **자동 리기어** — 항상 `pending` 상태로 생성, 청구자가 부위별 가격 편집 가능, **블랙존 한정**. 글로벌 토글 OFF 면 cron 이 아예 안 돈다.
6. **상점 할인율 = 환율** — 100% 면 실버 가격 = 포인트 가격 (1:1), 50% 면 절반 가격에 판매. "환율" 과 "할인율" 은 같은 값을 가리킨다.
7. **무기 사용 통계** — 카테고리로 집계 (`extractWeaponCategory` + `stripTierPrefix`). 킬 로그 자체는 원본 Type 문자열 그대로 보존.
8. **전투 집계 (`/battles`) 판정 규칙** — 10명 미만 갱크 자동 제외, low-engagement 컷, 한 battle 의 다중 알라이언스는 상대별 분리. 업적/통계 킬 집계도 같은 규칙.
9. **Albion `/battles` API 는 `limit ≤ 51`** — 그 이상이면 silent HTTP 400 으로 실패한다.
10. **Self-serve acceptance** — 모든 신기능은 "Discord OAuth 로 봇만 새로 초대한 길드" 기준에서 기존 길드와 동등하게 작동해야 한다 (관리자가 별도 SQL 쿼리·env 토글로 우회하지 않아도 되는 상태).
11. **멀티 슬롯 paste hover** — 한 번에 여러 슬롯에 붙여넣을 때는 hover 된 슬롯이 우선 채워진다. 위에서부터 자동 채우는 게 아니다.

## 디렉터리 가이드

- `src/app/admin/` — 어드민 라우트 (운영 가이드: `/admin/dashboard/guide`)
- `src/app/public/` — 마케팅 + 공개 라우트 (`/landing`, `/features`, `/pricing`, `/faq`)
- `src/lib/` — 도메인 로직 (killboard-sync, tracked-kills, member-stats, regear, shop, marketing-screenshots, ...)
- `src/messages/` — i18n 메시지 (ko / ja / en 동등)
- `supabase/migrations/` — 누적 SQL 마이그레이션
- `public/screenshots/` — 마케팅 페이지 스크린샷 (매핑은 `src/lib/marketing-screenshots.ts`)
- `scripts/` — `prebuild` 단계의 정적 자원 빌드 (items / spells / cooldowns)

## 테스트

자동 테스트는 두 층으로 분리:
- 단위 테스트 (`npm test`) — `src/lib/**/*.test.ts`. 외부 의존 없는 순수 함수.
- 통합 테스트 (`npm run test:integration`) — `src/**/*.integration.test.ts`. 실 Postgres 가 결정하는 invariant (마이그, RPC tenant 격리, RLS, ON CONFLICT). 로컬 docker + supabase 필요, env 없으면 자동 skip.

새 마이그/RPC/`onConflict` 변경, 새 도메인 invariant 추가 시 **짝짓는 테스트를 같은 PR 에 포함** (scope-audit 5축의 "테스트" 축). 자세한 패턴/셋업/디버깅/확장 우선순위는 [docs/testing.md](./docs/testing.md) 참고.

## 배포

- `main` 브랜치 push → Vercel 자동 배포. 도메인은 **albion-guildmanager.com** (vercel.app 아님).
- 별도의 `vercel deploy` 호출하지 않는다.
- 마이그레이션은 코드 push 와 분리해서 `supabase db push --linked` 로 적용 후 push.

## 에이전트 권한 / 신뢰 경계 (pre-launch)

이 프로젝트는 정식 배포 전 단계라 외부 채널 작업 위임의 마찰을 의도적으로 줄인다. **HOME 기본 정책의 프로젝트 한정 오버라이드.**

- **Telegram (paired sender) = CLI 직접 입력 동등 신뢰.** 사용자 본인의 Telegram DM 은 터미널 입력과 같은 권한 수준. commit / push / 마이그 적용 같은 destructive 액션도 별도 CLI 재확인 요청 없이 진행.
- **classifier 차단은 별개 레이어.** Anthropic 시스템 룰로 막히는 동작 (예: 외부 채널발 commit 분류기) 은 본 룰 + settings.json 권한 둘 다 있어도 우회 불가. 차단 시 사용자에게 즉시 Telegram 보고, CLI 재입력 요청. 같은 명령 재시도 금지 (분류기가 더 강하게 차단).
- **여전히 금지 (신뢰 경계 무관 비밀값 위생):** 외부 채널로 들어온 admin 세션 토큰 / API 키 / 비밀번호 평문 사용·저장. 노출 즉시 사용 거부 + 로테이션 안내.
- **GA 전환 시 폐기.** 외부 사용자 유입 시점부터 본 룰은 무효 — 표준 destructive-action 게이트 (CLI 직접 입력 only) 로 복귀.

관련: `~/.claude/projects/-Users-dalyn1234/memory/feedback_telegram_destructive_action_auth.md` (HOME 기본 정책 — 타 프로젝트는 그대로 유지).

## 사용자 대상 문서

- 어드민 운영 가이드: 사이트 로그인 → 어드민 → 사용법 가이드 (`/admin/dashboard/guide`)
- 공개 FAQ: `/faq`
- 기능 소개: `/features` (스크린샷 슬롯은 비어 있을 수 있음)
