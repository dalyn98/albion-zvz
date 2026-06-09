# Performance Optimization Report — 2026-06-09

## 배포 정보

- 배포 일시: 2026-06-09 16:32 KST
- Production deployment: `dpl_4WufZsvNehaCwP9xpc9KDY5tp2J8`
- Production URL: `https://albion-guildmanager.com`
- 배포 commit: `883fe1ec perf: trim shared render payloads`

## 적용한 최적화

1. 클라이언트 i18n payload 축소
   - 기존에는 모든 앱 페이지에 113개 client namespace를 내려보냈다.
   - `/public/*` 마케팅 페이지와 `/shop`에 route별 message profile을 적용했다.
   - `/shop`: 267,192 bytes -> 15,858 bytes, 약 94.1% 감소
   - 마케팅: 267,192 bytes -> 10,729 bytes, 약 96.0% 감소

2. 마케팅 공개 페이지 세션 의존 제거
   - `MarketingNav`, landing, pricing, feature detail에서 `getSession()`을 제거했다.
   - 공개 랜딩의 사용자별 "내 길드" CTA와 inline screenshot 편집은 제거하고, 운영 편집은 `/super-admin/marketing-screenshots`로 유지했다.

3. AppShell 중복 세션 조회 제거
   - `RootLayout`에서 이미 확인한 `session/guildId`를 `AppShell`로 전달한다.
   - 앱 페이지마다 `AppShell` 내부의 추가 `getSession()` 및 guild 해석 경로를 줄였다.

4. `/shop` 사용자 데이터 병렬화
   - 포인트 잔액/내 주문 조회가 카탈로그 로드 뒤에 순차 실행되던 구조를 병렬 실행으로 변경했다.
   - `src/lib/shop/member-queries.ts`로 상점 member loader를 분리해 page와 server action이 같은 구현을 공유한다.

5. `/me` 하단 섹션 스트리밍
   - 다중 길드 활동 기록과 제작 픽업 섹션을 `Suspense`로 분리했다.
   - 첫 화면 렌더가 하단 보조 섹션 DB 조회를 기다리지 않도록 변경했다.

6. `/events/[id]` projection 축소
   - `events.select('*')`, `parties.select('*')`를 필요한 컬럼 명시 select로 바꿨다.
   - 슬롯은 현재 UI가 대부분의 장비 필드를 사용하므로 `slots(*)`는 유지했다.

## 검증 결과

- `npx --no-install vitest run src/lib/client-messages.test.ts`: 통과
- `npx --no-install tsc --noEmit --skipLibCheck`: 통과
- `npm test`: 223 files, 1230 tests 통과
- `npm run lint`: 통과
- `npm run build`: 통과
- Vercel production: Ready

## 속도 변화

측정 기준:
- 위치: 현재 Codex 작업 환경에서 production 도메인 직접 요청
- 값: `curl`의 `time_starttransfer` 기준 TTFB
- cold: 배포 직후 첫 요청
- warm: 같은 경로 반복 요청의 중앙값
- 앱 경로의 anon 측정은 AppGate/비로그인 경로라 로그인 사용자 화면 전체와 1:1 대응하지 않는다.

| 경로 | 상태 | 이전 cold | 이후 cold | 이전 warm | 이후 warm | 변화 |
|---|---:|---:|---:|---:|---:|---:|
| `/features` | public | 3.138s | 2.269s | 0.307s | 0.297s | warm 3.3% 개선 |
| `/pricing` | public | 0.659s | 0.778s | 0.290s | 0.292s | 거의 동일 |
| `/faq` | public | 0.587s | 0.584s | 0.309s | 0.282s | warm 8.7% 개선 |
| `/members` | anon tenant | 3.669s | 3.873s | 0.773s | 0.751s | warm 2.8% 개선 |
| `/regear` | anon tenant | 1.060s | 1.032s | 0.724s | 0.741s | 거의 동일 |
| `/shop` | anon tenant | 1.069s | 0.837s | 0.951s | 0.536s | warm 43.6% 개선 |
| `/me` | anon tenant | 1.023s | 0.992s | 0.737s | 0.764s | anon 기준 거의 동일 |

로그인 member 세션 배포 후 측정:

| 경로 | after warm TTFB 중앙값 | 비고 |
|---|---:|---|
| `/me` | 0.833s | 하단 활동 기록/제작 픽업은 Suspense 분리됨 |
| `/shop` | 0.993s | 사용자 잔액/주문과 카탈로그 병렬화 |
| `/members` | 1.022s | 이번 변경의 직접 대상은 아님 |
| `/regear` | 0.983s | 이번 변경의 직접 대상은 아님 |

## 해석

- 가장 큰 개선은 `/shop`이다. 기존에는 카탈로그 로드 뒤에 잔액/주문 조회가 이어졌고, 이제 병렬화되어 warm TTFB가 약 0.95s에서 약 0.54s로 내려갔다.
- 마케팅 페이지는 TTFB 자체보다 client message payload 감소 효과가 크다. 마케팅 client messages는 raw 기준 약 96% 줄었다.
- `/features`, `/faq`는 warm TTFB가 소폭 개선됐지만, `cache-control: private, no-cache, no-store`와 `x-vercel-cache: MISS`는 유지된다. root layout이 아직 동적 SSR이기 때문이다.
- `/me`의 anon TTFB는 AppGate 경로라 이번 Suspense 분리 효과를 직접 반영하지 않는다. 로그인 member 기준으로는 하단 보조 섹션이 첫 응답을 막지 않게 바뀌었다.

## 남은 병목

1. root layout route group 분리
   - 현재 root layout이 여전히 `headers()`, `getLocale()`, `getMessages()`, `getSession()`을 읽어 전체 route가 동적 SSR로 묶인다.
   - 마케팅/문서 route를 별도 layout으로 분리해야 Vercel CDN cache HIT가 가능해진다.

2. `/events/[id]` 슬롯 projection 축소
   - 이벤트/파티 projection은 줄였지만 슬롯은 아직 `slots(*)`다.
   - `EventPartyGrid`, `EventSlotSidebar`, build sheet 관련 prop을 기준으로 슬롯 필드를 더 좁히는 작업이 남았다.

3. route별 i18n profile 확대
   - 이번 배포는 마케팅과 `/shop`만 profile을 적용했다.
   - `/members`, `/regear`, `/me`, `/events/[id]`, admin route별 profile을 추가하면 client payload를 더 줄일 수 있다.

4. Cache Components/PPR
   - `cacheComponents: true`는 아직 켜지 않았다.
   - route group 분리 후 `use cache`, `cacheTag`, `cacheLife`로 공개 데이터와 공통 설정을 단계적으로 이전하는 것이 안전하다.
