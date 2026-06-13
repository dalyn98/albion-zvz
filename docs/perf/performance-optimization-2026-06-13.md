# Performance Optimization Report - 2026-06-13

## 배포

- Commit: `93ce2b7c`
- Vercel deployment: `dpl_2c7MgZeDvNLvKYbKUVus4kwFeVLh`
- Production URL: `https://albion-guildmanager.com`
- 측정 기준: production warm sample, 2026-06-13 18:13 KST

## 원인

1. AppShell이 모든 앱 렌더에서 관리자 배지, 멤버 포인트, 대기 요청, 사이폰 요약을 SSR에서 기다렸다.
2. Root layout이 locked/gate 화면에도 전체 client i18n namespace를 주입해 HTML/RSC payload가 컸다.
3. `/members`가 첫 진입 때 활동 멤버, 게스트, Albion roster, 탈퇴 멤버를 모두 로드했다.
4. `/admin/dashboard`가 온보딩/운영 패널 데이터를 상단 렌더 전에 모두 기다렸다.
5. Sentry debug logger 제거 옵션이 구버전 설정이라 빌드 경고가 남았다.

## 작업

- AppShell 상태 조회를 `/api/app-shell/status`로 분리하고 초기 SSR에서는 사이드바 구조만 렌더.
- locked, home, members, shop, regear, marketing route별 client i18n payload를 분리.
- `/members`는 현재 탭만 SSR로 로드하고, 다른 탭은 클릭 시 지연 로드.
- `/admin/dashboard` readiness 패널을 Suspense streaming 영역으로 분리.
- Sentry logger tree-shaking을 `webpack.treeshake.removeDebugLogging`으로 갱신.

## Production HTTP 변화

Baseline: `artifacts/production-verify/2026-06-13T07-41-33-777Z/tenant-unauth-cache.md`
After: `artifacts/perf/production-tenant-unauth-after-93ce2b7c-warm.md`

| 경로 | TTFB Before | TTFB After | TTFB 변화 | Total Before | Total After | Total 변화 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `/` | 244ms | 261ms | +17ms (+7%) | 1043ms | 751ms | -292ms (-28%) |
| `/members` | 245ms | 258ms | +13ms (+5%) | 1269ms | 711ms | -558ms (-44%) |
| `/regear` | 244ms | 251ms | +7ms (+3%) | 1297ms | 708ms | -589ms (-45%) |
| `/shop` | 250ms | 250ms | 0ms | 1049ms | 518ms | -531ms (-51%) |
| `/admin/dashboard` | 30ms | 28ms | -2ms (-7%) | 30ms | 29ms | -1ms (-3%) |

해석: TTFB는 Vercel dynamic MISS라 큰 폭으로 줄지 않았지만, HTML/RSC payload 축소로 total response 시간이 28-51% 줄었다.

## Browser 변화

Baseline은 2026-06-13 최적화 전 Playwright one-off 측정값, After는 배포 후 동일 방식 측정값.

| 화면 | DCL Before | DCL After | Load Before | Load After | HTML Before | HTML After | JS Before | JS After |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| public `/features` | 127ms | 128ms | 168ms | 235ms | 13.0KB | 13.0KB | 235KB | 235KB |
| tenant `/` | 1078ms | 712ms | 1716ms | 1247ms | 99.0KB | 9.5KB | 277KB | 277KB |
| tenant `/members` | 1284ms | 1137ms | 1340ms | 1139ms | 98.6KB | 9.0KB | 279KB | 279KB |

해석: 공개 마케팅 화면은 이번 변경 대상이 아니라 거의 동일하다. 테넌트 앱 화면은 client message payload 축소 영향으로 HTML 전송량이 약 90% 줄었고, DCL/load가 개선됐다.

## 검증

- `npm test -- client-messages members-admin root-layout-boundary admin-badges super-admin-account-merge`: PASS
- `npm run lint`: PASS
- `npx --no-install tsc --noEmit --skipLibCheck`: PASS
- `npm run build`: PASS
- Local browser smoke: `artifacts/browser-smoke/local-public-pass-2026-06-13.md` PASS
- Production verify: `artifacts/production-verify/2026-06-13-after-perf-code/summary.md` PASS
- Production browser public: 6 passed / 0 failed

## 한계

- 인증된 관리자/멤버 세션 수치는 이번 자동 측정에 포함하지 못했다. 해당 개선(AppShell 상태 DB 조회 SSR 제거, `/members` 탭 지연 로드, admin dashboard Suspense)은 코드 경로와 빌드로 검증했고, 실제 세션 storageState가 있으면 다음 측정에서 FCP/TTFB까지 추가 비교한다.
- `/members`, `/regear`, `/shop` 비로그인 total 개선은 AppGate payload 축소가 주효하다.
