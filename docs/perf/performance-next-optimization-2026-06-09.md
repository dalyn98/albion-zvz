# 2026-06-09 3차 성능 최적화 보고

- Production deployment: `dpl_AvKHYdfNTmGmhmd96P8Fv7VqHvfV`
- Production URL: `https://albion-guildmanager.com`
- Code head: `af4d7b97`
- 배포 전 측정: `docs/perf/perf-smoke-2026-06-09-before-next.md`
- 배포 후 측정: `docs/perf/perf-smoke-2026-06-09-after-next-7samples.md`

## 적용 작업

1. 성능 측정 자동화
   - `npm run perf:smoke` 추가.
   - public/tenant 주요 경로의 status, TTFB, total time, Vercel cache 값을 Markdown으로 저장.
   - 쿠키 파일을 써도 보고서에는 쿠키 값을 기록하지 않도록 처리.

2. route-scoped client i18n profile 확대
   - 기존: marketing, `/shop` 중심.
   - 추가: `/members`, `/regear`, `/me/*`, `/events/*`.
   - 전체 client message fallback 대신 route별 client component가 실제로 쓰는 namespace만 전달.

3. 이벤트 slot query projection 축소
   - `/events/[id]`, `/events/[id]/party/[partyNumber]`, `/admin/dashboard/events/[id]`의 `slots(*)`/`select('*')` 제거.
   - `EVENT_ROW_SELECT`, `PARTY_WITH_SLOTS_SELECT`, `SLOT_ROW_SELECT` 상수로 명시 projection 고정.
   - guardrail test로 `slots(*)` 재발 방지.

4. root session read 단축
   - marketing/docs/demo/invite 같은 standalone public shell 경로에서 root layout의 선행 `getSession()` 호출 생략.
   - `ImpersonationBanner`는 root에서 이미 계산한 session을 prop으로 재사용.
   - `/public/g/*`, `/events/[id]`, app/admin 경로는 기존 session 기반 동작 유지.

5. 이벤트 슬롯 권한 보정
   - 멤버 역할이 없는 관리자도 이벤트 슬롯 신청/지정 흐름을 통과하도록 서버 action과 이벤트 상세 page 판정 일치.
   - 관리자 권한은 기존 session/tenant gate 뒤에서만 적용.

## 검증

- `npx --no-install vitest run src/lib/perf-smoke.test.ts src/lib/client-messages.test.ts src/lib/event-query-selects.test.ts src/lib/app-route-classification.test.ts`
  - 4 files / 24 tests passed
- `npx --no-install tsc --noEmit --skipLibCheck`
  - passed
- `npm test`
  - 225 files / 1241 tests passed
- `npm run lint`
  - passed
- `npm run build`
  - passed
- Vercel production
  - `dpl_AvKHYdfNTmGmhmd96P8Fv7VqHvfV` Ready

## 속도 변화

측정은 production alias 기준이다. 모든 경로가 `x-vercel-cache: MISS`였으므로 CDN HIT 개선이 아니라 SSR/서버 작업량과 응답 변동을 본 값이다.

| 경로 | 배포 전 Median TTFB | 배포 후 Median TTFB | 변화 | 배포 전 Median Total | 배포 후 Median Total | 변화 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| public `/features` | 268ms | 267ms | -0.4% | 448ms | 448ms | 0.0% |
| public `/pricing` | 361ms | 267ms | -26.0% | 528ms | 449ms | -15.0% |
| public `/faq` | 267ms | 258ms | -3.4% | 453ms | 441ms | -2.6% |
| tenant `/members` | 731ms | 700ms | -4.2% | 1293ms | 882ms | -31.8% |
| tenant `/regear` | 944ms | 771ms | -18.3% | 1325ms | 958ms | -27.7% |
| tenant `/shop` | 479ms | 486ms | +1.5% | 673ms | 680ms | +1.0% |
| tenant `/me` | 711ms | 689ms | -3.1% | 1256ms | 877ms | -30.2% |

## 해석

- `/members`, `/regear`, `/me`는 total time이 크게 줄었다. route-scoped i18n payload와 root/session 중복 절감 효과가 반영된 것으로 본다.
- public marketing은 root session skip에도 여전히 `MISS` 동적 SSR이다. `getLocale()`, `getMessages()`, metadata/header 의존이 남아 있어 CDN HIT까지는 도달하지 않았다.
- `/shop`은 이번 작업의 직접 타깃이 아니며, 측정상 변화가 거의 없다.
- 이벤트 상세/편집은 smoke 대상에는 없지만, query projection guardrail로 slot row payload 폭을 줄였다.

## 남은 병목

1. route group split
   - root layout에서 locale/messages/metadata까지 분리하지 않으면 public marketing CDN HIT는 어렵다.
2. Cache Components
   - marketing screenshots, public docs, public guild profile, tenant settings loader를 cache tag 단위로 분리해야 한다.
3. `/shop` catalog pagination
   - 초기 catalog 전체 전달 대신 category/search/page 단위 loader로 분리해야 체감 개선이 나온다.
