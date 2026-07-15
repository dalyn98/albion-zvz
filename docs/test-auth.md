# Test Auth Sessions

실제 Discord OAuth를 매번 통과하지 않고 로그인 이후 상태를 테스트하기 위한 개발용 세션 발급 엔드포인트입니다.

## 권장 로컬 셋업

```bash
npm run dev:local
```

이 명령이 로컬 Supabase 연결, 안전한 로컬 secret, `COOKIE_SECURE=false`,
Test Auth 활성화, `test-auth:member`의 신뢰된 Albion identity seed까지 준비합니다.
실제 Discord 환경 변수는 필요하지 않습니다.

별도 터미널에서 브라우저 세션과 전체 smoke를 만들 수 있습니다.

```bash
npm run test:auth:states       # .auth/test-member.json + test-admin.json
npm run smoke:browser:local    # public/demo/member/admin Chromium 검증
```

`.auth/`는 git ignore 대상이며 세션 쿠키 값은 로그나 smoke 보고서에 기록하지 않습니다.

## 수동 활성화

`.env.local`에 다음 값을 추가합니다.

```bash
ENABLE_TEST_AUTH=true
TEST_AUTH_SECRET=랜덤_16자_이상_긴_문자열
```

Vercel production(`VERCEL_ENV=production`)에서는 이 값이 있어도 `/api/test/auth/session`이 항상 404를 반환합니다. Vercel preview(`VERCEL_ENV=preview`)에서는 명시적으로 활성화한 경우 사용할 수 있고, Vercel이 아닌 일반 production 실행(`NODE_ENV=production`)에서는 비활성화됩니다.
로컬 HTTP 브라우저에서 쿠키가 저장되지 않으면 `.env.local`의 `COOKIE_SECURE=false`를 확인하세요. 이 엔드포인트는 실제 앱 세션과 같은 `cookieOptions()`를 사용합니다.

## 사용 예시

```bash
curl -i -X POST http://localhost:3000/api/test/auth/session \
  -H "content-type: application/json" \
  -H "x-test-auth-secret: $TEST_AUTH_SECRET" \
  -d '{"role":"admin","tenantSlug":"menhera","returnTo":"/admin/dashboard"}'
```

지원 역할:

- `admin`: 관리자 세션
- `member`: 일반 길드원 세션
- `eventCreator`: 이벤트 생성 담당관 세션
- `localGuildAccount`: Discord 없는 Albion 계정 세션
- `guest`: 이벤트 초대 게스트 세션. `eventScope`가 필요합니다.
- `regearOfficer`: 리기어 승인/가격/일괄 처리 담당관 세션
- `shopQuartermaster`: 상점·재고·상자 로그 담당관 세션
- `logOfficer`: 상자 로그, 사이펀, 루팅 검증 감사 담당관 세션
- `craftLead`: 제작 요청 생성/납품/관리 담당관 세션
- `analyst`: 통계, 킬보드 동기화, 전투 관리, 감사 조회 담당관 세션
- `guildSettings`: 길드 기본 설정/토글/프로필 담당관 세션

브라우저 자동화에서는 이 POST 응답의 `set-cookie`를 브라우저 컨텍스트에 넣거나, `{"redirect":true}`를 함께 보내 303 응답으로 원하는 경로에 진입시키면 됩니다.

## 주의

이 엔드포인트는 OAuth 이후 앱 세션을 테스트하기 위한 도구입니다. Discord 동의 화면, Discord API 권한, 봇 설치 OAuth 자체를 검증하려면 기존 OAuth 경로를 별도로 1회 확인해야 합니다.
