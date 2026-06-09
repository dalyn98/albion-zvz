# 4차 최적화 배포 전 성능 측정

- 측정 시각: 2026-06-09T10:01:52.077Z
- 샘플 수: 7

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| public /features | 200 | 271 | 464 | 250 | 440 | MISS |
| public /pricing | 200 | 254 | 438 | 241 | 257 | MISS |
| public /faq | 200 | 267 | 438 | 256 | 271 | MISS |
| tenant /members | 200 | 754 | 945 | 679 | 861 | MISS |
| tenant /regear | 200 | 738 | 927 | 716 | 729 | MISS |
| tenant /shop | 200 | 491 | 690 | 469 | 655 | MISS |
| tenant /me | 200 | 716 | 908 | 680 | 893 | MISS |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
