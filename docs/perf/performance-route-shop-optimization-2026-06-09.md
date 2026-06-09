# 2026-06-09 4차 성능 최적화 보고

- Production deployment: `dpl_4s4QzgeDafv9C4RwVeqzVkvCofh9`
- Production URL: `https://albion-guildmanager.com`
- Code head: `290b50f8`
- 성능 측정 대상 코드 배포: `dpl_A6q4CBD3N9inRWgZa6GZE1GSLR9X` (`7b31e3ec`)
- 배포 전 측정: `docs/perf/perf-smoke-2026-06-09-before-route-shop.md`
- 배포 후 측정: `docs/perf/perf-smoke-2026-06-09-after-route-shop.md`

## 적용 작업

1. root layout / route group 분리
   - `src/app/layout.tsx`를 정적 root shell로 축소했다.
   - 기존 세션, AppShell, 시스템 공지, route별 client messages 로직은 `(app-shell)` layout으로 이동했다.
   - public/demo/invite는 `(public-shell)`로 분리해 app shell의 선행 세션/공지 로더를 타지 않게 했다.

2. `/shop` 구매자 카탈로그 서버 페이지네이션
   - 기존 `/shop`은 `shop_inventory` 공개 재고를 전량 페이지 순회 후 클라이언트에서 80개씩 잘라 보여줬다.
   - 변경 후 초깃값은 80개만 조회하고, `더 보기`는 URL의 `page`를 올려 누적 범위만 다시 조회한다.
   - 검색어와 tier도 서버 쿼리에 반영한다. 다국어 검색 성격을 유지하기 위해 `albion-items.json`의 locale별 이름에서 후보 `unique_name`을 찾아 DB 필터에 포함했다.
   - 주문 제출은 기존처럼 서버 action에서 `inventoryId`, `guild_id`, 재고, 가격을 다시 검증하므로 구매 보안 경계는 유지했다.

3. route group guard 보정
   - demo route, event projection, super-admin i18n 예외 테스트가 새 `(app-shell)` / `(public-shell)` 경로를 보도록 갱신했다.

4. Cache Components 적용 가능성 검증
   - `next.config.ts`에 `cacheComponents: true`를 켜서 빌드 호환성을 실험했다.
   - Next.js 16.2.6에서 `cacheComponents`는 `export const dynamic = 'force-dynamic'` route segment config와 호환되지 않아 API/admin route 다수가 즉시 컴파일 실패했다.
   - 따라서 이번 배포에는 전역 Cache Components를 싣지 않았다. 별도 마이그레이션에서 `force-dynamic` 제거/대체와 Suspense 경계를 함께 설계해야 한다.

## 검증

- `npm test`
  - 226 files / 1249 tests passed
- `npm run lint`
  - passed
- `npm run build`
  - passed
- Vercel production
  - `dpl_4s4QzgeDafv9C4RwVeqzVkvCofh9` Ready

## 속도 변화

측정은 production alias 기준이며 각 경로 7샘플 median이다. 모든 경로가 `x-vercel-cache: MISS`였으므로 CDN HIT 개선이 아니라 SSR TTFB와 응답 완료 시간 변동으로 해석한다.

| 경로 | 배포 전 Median TTFB | 배포 후 Median TTFB | TTFB 변화 | 배포 전 Median Total | 배포 후 Median Total | Total 변화 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| public `/features` | 271ms | 255ms | -5.9% | 464ms | 440ms | -5.2% |
| public `/pricing` | 254ms | 247ms | -2.8% | 438ms | 427ms | -2.5% |
| public `/faq` | 267ms | 245ms | -8.2% | 438ms | 427ms | -2.5% |
| tenant `/members` | 754ms | 242ms | -67.9% | 945ms | 1126ms | +19.2% |
| tenant `/regear` | 738ms | 251ms | -66.0% | 927ms | 1117ms | +20.5% |
| tenant `/shop` | 491ms | 249ms | -49.3% | 690ms | 684ms | -0.9% |
| tenant `/me` | 716ms | 236ms | -67.0% | 908ms | 1041ms | +14.6% |

## 해석

- `/shop`은 이번 직접 타깃이다. Median TTFB가 491ms에서 249ms로 줄었다. 전체 카탈로그 row를 매 요청 전부 읽고 직렬화하던 병목을 초기 80개 조회로 줄인 효과로 본다.
- `/shop` Median Total은 거의 동일하다. 서버 첫 응답은 빨라졌지만, 전체 완료 시간은 HTML/RSC payload, 이미지 후보, 네트워크 변동 영향을 같이 받는다.
- `/members`, `/regear`, `/me`는 TTFB가 크게 줄었지만 Total은 증가했다. route shell 분리와 Vercel 함수 warm 상태 영향이 섞였을 가능성이 있어 “체감 완료 시간 개선”으로 단정하지 않는다.
- public marketing은 소폭 개선됐지만 여전히 Dynamic SSR이다. `(public-shell)` layout과 `next-intl` request config가 `headers()`/`cookies()`에 묶여 있어 CDN HIT로 전환되지는 않았다.

## 남은 병목

1. Cache Components 전환 선행 작업
   - `cacheComponents: true`와 충돌하는 `force-dynamic` route segment config를 route별로 제거/대체해야 한다.
   - fresh data가 필요한 API/admin route는 `connection()` 또는 no-store response 정책으로 명시해야 한다.

2. public marketing 정적화
   - marketing page가 server `getTranslations()`와 request locale에 직접 묶여 있다.
   - SEO locale URL, cookie locale, Accept-Language fallback을 분리해 정적 locale variant 또는 캐시 가능한 translation loader로 재설계해야 한다.

3. `/shop` 추가 최적화
   - 현재는 `count: exact`로 total을 구한다. 재고가 더 커지면 `pageSize + 1` 방식으로 count를 제거해 DB count 비용도 줄일 수 있다.
   - 검색 결과가 넓은 경우 `unique_name.in.(...)` 필터가 길어질 수 있어 향후 materialized search key 또는 RPC로 옮기는 것이 안전하다.
