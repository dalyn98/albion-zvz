# 공개 마케팅 CDN 캐시 검증

- 측정 시각: 2026-06-11T09:32:21.295Z
- 샘플 수: 3

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache | CDN Cache-Control |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| custom /features | 200 | 50 | 51 | 36 | 37 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /pricing | 200 | 581 | 719 | 65 | 65 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /faq | 200 | 134 | 135 | 39 | 40 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |
| custom /docs | 200 | 37 | 38 | 31 | 32 | HIT, MISS | public, s-maxage=3600, stale-while-revalidate=86400 |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
