# 프로젝트 페이지 속도 최적화 보고서 (2026-06-11)

## 변경 요약

- 공개/데모 route group의 `NextIntlClientProvider`를 분리했다.
- 공개 마케팅 페이지는 `common`, `publicMarketing`, `sidebar`만 client로 전달한다.
- 데모, 공개 활동 공유, 전술 공유는 각 route scope에 필요한 namespace만 별도 provider로 전달한다.
- `/shop` 카탈로그 쿼리에서 Supabase `count: 'exact'`를 제거하고 `pageSize + 1` 조회로 `hasMore`를 판단한다.
- `.vercel/output` 생성물이 `npm run lint`에 포함되지 않도록 ESLint ignore를 보강했다.

## Client Message Payload

측정 기준: `src/messages/ko.json`에서 provider로 직렬화되는 message JSON 크기.

| Scope | Namespace | Raw | Gzip | 기존 app provider 대비 gzip |
| --- | ---: | ---: | ---: | ---: |
| 기존 app/public 공통 provider | 117 | 287,923 B | 86,201 B | 기준 |
| 마케팅 provider | 3 | 4,499 B | 2,057 B | -97.6% |
| 데모 provider | 43 | 153,923 B | 47,200 B | -45.2% |
| 공개 활동 공유 provider | 1 | 1,231 B | 705 B | -99.2% |
| 전술 공유 provider | 1 | 4,271 B | 1,943 B | -97.7% |

핵심 효과는 `/features`, `/pricing`, `/faq`, `/docs` 같은 마케팅 페이지에서 데모/관리자/상점용 대형 message payload가 빠진 것이다.

## `/shop` 쿼리 변경

| 항목 | 변경 전 | 변경 후 |
| --- | --- | --- |
| 총 개수 계산 | `select(..., { count: 'exact' })` | 제거 |
| 다음 페이지 판단 | `rows.length < total` | `page * pageSize + 1`번째 행 존재 여부 |
| 표시 총계 | 정확한 total | 다음 페이지가 있으면 `80+`처럼 근사 표시 |
| tenant 필터 | `eq('guild_id', guildId)` | 유지 |

정확한 count가 필요한 UX가 아니므로 DB count 비용을 제거했다.

## 로컬 Production 검증

명령:

- `npm run lint`
- `npm test`
- `npm run build`
- `SMOKE_BASE_URL=http://localhost:3000 SMOKE_PATHS='/features,/public/pricing,/public/faq,/public/docs,/public/privacy,/public/terms' npm run smoke:browser`
- `SMOKE_BASE_URL=http://localhost:3000 SMOKE_GROUPS=demo npm run smoke:browser`

결과:

- Lint: 통과
- Unit test: 237 files / 1654 tests 통과
- Build: 통과
- Public browser smoke: 6 passed / 0 failed
- Demo browser smoke: 5 passed / 0 failed
- Raw i18n token: 0
- Console error: 0
- Failed request: 0

## 로컬 Perf Smoke

측정 파일: `artifacts/perf-smoke-local-optimization-public-routes-2026-06-11.md`

| 경로 | Status | Median TTFB | Median Total |
| --- | ---: | ---: | ---: |
| `/features` | 200 | 5ms | 5ms |
| `/public/pricing` | 200 | 4ms | 5ms |
| `/public/faq` | 200 | 4ms | 5ms |
| `/public/docs` | 200 | 4ms | 5ms |
| `/demo` | 200 | 7ms | 9ms |
| `/demo/shop` | 200 | 8ms | 9ms |
| `/shop?q=infernal&tier=8` | 200 | 13ms | 226ms |

로컬 수치는 네트워크/캐시 영향이 작아 production 체감값과 직접 동일하지 않다. 이번 작업의 확정 개선 지표는 client message payload 감소와 `/shop` exact count 제거다.

## 배포 후 측정

배포:

- Commit: `7158ee33 perf: split public intl payload`
- Vercel production: Ready
- 도메인: `https://albion-guildmanager.com`

검증:

- Production browser smoke: 11 passed / 0 failed
- Raw i18n token: 0
- Console error: 0
- Failed request: 0

### Production Perf Smoke

측정 파일: `artifacts/perf-smoke-production-optimization-2026-06-11.md`

| 경로 | Status | Median TTFB | Median Total | Vercel Cache |
| --- | ---: | ---: | ---: | --- |
| `/features` | 200 | 532ms | 543ms | MISS |
| `/pricing` | 200 | 257ms | 295ms | MISS |
| `/faq` | 200 | 273ms | 443ms | MISS |
| `/docs` | 200 | 261ms | 450ms | MISS |
| `/demo` | 200 | 262ms | 625ms | MISS |
| `/demo/shop` | 200 | 333ms | 876ms | MISS |
| `/shop?q=infernal&tier=8` | 200 | 301ms | 1506ms | MISS |

캐시 정책은 아직 `MISS`라 TTFB 개선은 제한적이다. 이번 배포의 실제 개선은 initial document에 포함되던 client message payload 감소다.

### Production Browser Navigation

| 경로 | Document Transfer | Document Decoded | FCP | Load |
| --- | ---: | ---: | ---: | ---: |
| `/features` | 13.6KB | 64.1KB | 692ms | 746ms |
| `/pricing` | 13.7KB | 60.0KB | 500ms | 506ms |
| `/faq` | 15.1KB | 97.3KB | 492ms | 491ms |
| `/docs` | 14.2KB | 64.0KB | 492ms | 491ms |
| `/demo` | 61.4KB | 230.9KB | 492ms | 656ms |
| `/demo/shop` | 63.0KB | 245.2KB | 508ms | 1003ms |

이전 audit에서 공개 마케팅 페이지는 document transfer가 약 97-99KB, decoded body가 약 353-390KB였다. 배포 후 마케팅 페이지는 13-15KB transfer, 60-97KB decoded 수준으로 내려갔다.

## 남은 병목

- 공개 페이지 TTFB는 여전히 dynamic render와 `x-vercel-cache: MISS` 영향을 받는다.
- `/demo`는 데모 앱 컴포넌트를 많이 재사용하므로 마케팅 페이지보다 payload가 크다.
- `/shop`은 exact count 제거는 완료했지만, 검색/카탈로그 데이터 자체가 커서 별도 pagination/RPC 최적화 여지가 남아 있다.
