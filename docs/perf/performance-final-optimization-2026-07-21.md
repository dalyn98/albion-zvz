# 최종 사이트 성능 최적화

- 코드 기준선: `f94cef58`
- 구현 기준: `3201f0ed`
- 운영 대상: `https://albion-guildmanager.com`

## 적용 결과

### 이벤트 상세 서버 렌더

- 권한 확인 뒤 `guild_id + event_id`로 상태 revision을 먼저 읽는다.
- 이벤트/파티/슬롯 공통 트리는 `guild_id + event_id + state_revision` 캐시 키로 공유한다.
- 상태가 바뀌면 DB trigger가 revision을 올려 다음 요청이 새 캐시 키를 사용한다.
- 세션, 사용자 슬롯 상태, 게스트 프로필 등 viewer별 데이터는 캐시 밖에 유지한다.
- 번역, 설정, 시간대, 참가예정 및 독립 조회를 병렬 fan-out으로 실행한다.
- 비상 시 `AGM_EVENT_RENDER_SNAPSHOT_CACHE_DISABLED=true`로 공통 트리 캐시만 우회할 수 있다.

변경 없는 동일 이벤트의 공통 트리 DB 조회는 warm cache/동일 region 기준으로 요청마다 1회에서 revision당 1회로 줄어든다. 각 요청의 O(1) revision 확인과 viewer별 조회는 정확성 및 테넌트 격리를 위해 유지한다.

### 클라이언트 전송·렌더 비용

| 대상 | 개선 전 | 개선 후 | 변화 |
| --- | ---: | ---: | ---: |
| `/market` route page JS (raw) | 약 54.7 KB | 29.8 KB | -45.6% |
| `/market` route page JS (gzip) | 약 14.0 KB | 9.46 KB | -32.4% |
| `MemberTradeMarket.tsx` | 1,610 lines | 753 lines | -53.2% |

- 거래 등록, 주문, 가격 제안, 분쟁 UI 30.7 KB raw / 10.1 KB gzip을 탭 또는 분쟁 진입 전까지 지연한다.
- 이벤트 슬롯 picker/edit/assign UI 92.4 KB raw / 25.4 KB gzip을 최초 화면에서 제외한다.
- 운영 브라우저 검증에서 `/demo/events/evt-1` 최초 로드는 해당 지연 청크 0개, 신청 버튼 hover 뒤 필요한 picker 청크 1개만 요청했다.
- 멤버, 전투, 리기어, 제작 작업, 제작/기부/정산/교환/상점/거래분쟁 검토 행에 `content-visibility: auto`와 고유 크기 힌트를 적용했다.
- 관리자 대시보드의 비핵심 온보딩 분석 기록은 `after()`로 응답 이후 실행한다.

## 운영 전후 샘플

동일 경로를 각 5회 측정했다. 공개 페이지는 계속 CDN HIT이고 모든 응답은 200이다. 수 ms~수십 ms 변동은 네트워크/CDN 표본 오차 범위이며, 이번 단계의 주요 개선 대상은 인증 이벤트 공통 트리 조회와 초기 JS/렌더 비용이다.

| 경로 | TTFB 전 → 후 | Total 전 → 후 | Cache |
| --- | ---: | ---: | --- |
| `/features` | 48 → 52 ms | 50 → 53 ms | HIT |
| `/pricing` | 30 → 39 ms | 31 → 40 ms | HIT |
| `/faq` | 38 → 43 ms | 40 → 45 ms | HIT |
| `/docs` | 39 → 35 ms | 40 → 37 ms | HIT |
| `/demo` | 245 → 236 ms | 661 → 686 ms | MISS |
| `/demo/shop` | 230 → 257 ms | 658 → 706 ms | MISS |

원본 보고서:

- [배포 전 샘플](./perf-smoke-2026-07-21-before-final.md)
- [배포 후 샘플](./perf-smoke-2026-07-21-after-final.md)

## 검증

- 단위/소스 회귀: 354 files, 2,285 tests 통과
- TypeScript: 통과
- ESLint: 오류 0, 기존 경고 2
- production build: 통과
- 의존성 감사: 취약점 0 (`brace-expansion` 보안 버전으로 lock 갱신)
- 로컬 공개/데모 브라우저: 24/24 통과
- 운영 공개 브라우저: 6/6 통과
- 운영 데모 브라우저: 18/18 통과
- Vercel public cache + browser production verify: 2/2 통과

실 DB 통합 테스트는 로컬 Postgres가 중지돼 34개가 자동 skip됐다. 이번 변경에는 DB schema/RPC 변경이 없고, 기존 event revision trigger/RPC invariant 테스트 및 tenant/access source gate는 단위 회귀에 포함된다. 저장된 운영 인증 세션은 만료돼 인증 화면의 운영 Playwright 재검증은 수행하지 않았으며, 운영 DB를 로컬 테스트 인증에 재사용하지 않았다.
