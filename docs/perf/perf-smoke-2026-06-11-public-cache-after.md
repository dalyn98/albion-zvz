# 공개 마케팅 CDN 캐시 최적화 배포 후 측정

- 측정 시각: 2026-06-11T07:58:06.470Z
- 샘플 수: 3

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| custom /features | 200 | 295 | 301 | 38 | 38 | HIT, MISS |
| custom /pricing | 200 | 32 | 33 | 32 | 32 | HIT |
| custom /faq | 200 | 41 | 42 | 31 | 32 | HIT, MISS |
| custom /docs | 200 | 32 | 33 | 30 | 31 | HIT, MISS |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
