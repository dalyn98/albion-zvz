# 최종 성능 최적화 전 운영 기준선

- 측정 시각: 2026-07-21T09:53:48.415Z
- 샘플 수: 5

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache | CDN Cache-Control |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| custom /features | 200 | 48 | 50 | 32 | 34 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /pricing | 200 | 30 | 31 | 29 | 31 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /faq | 200 | 38 | 40 | 35 | 37 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /docs | 200 | 39 | 40 | 32 | 33 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /demo | 200 | 245 | 661 | 218 | 240 | MISS | - |
| custom /demo/shop | 200 | 230 | 658 | 222 | 380 | MISS | - |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
