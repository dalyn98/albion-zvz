# 최종 성능 최적화 후 운영 측정

- 측정 시각: 2026-07-21T10:08:30.713Z
- 샘플 수: 5

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache | CDN Cache-Control |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| custom /features | 200 | 52 | 53 | 31 | 33 | HIT | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /pricing | 200 | 39 | 40 | 29 | 30 | HIT | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /faq | 200 | 43 | 45 | 40 | 42 | HIT | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /docs | 200 | 35 | 37 | 27 | 28 | HIT | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /demo | 200 | 236 | 686 | 232 | 376 | MISS | - |
| custom /demo/shop | 200 | 257 | 706 | 232 | 646 | MISS | - |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
