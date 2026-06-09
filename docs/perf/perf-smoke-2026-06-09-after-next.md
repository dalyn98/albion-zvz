# 배포 후 성능 측정

- 측정 시각: 2026-06-09T09:32:41.251Z
- 샘플 수: 3

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| public /features | 200 | 261 | 456 | 260 | 440 | MISS |
| public /pricing | 200 | 276 | 469 | 251 | 429 | MISS |
| public /faq | 200 | 402 | 583 | 266 | 455 | MISS |
| tenant /members | 200 | 1049 | 1249 | 785 | 971 | MISS |
| tenant /regear | 200 | 759 | 943 | 741 | 924 | MISS |
| tenant /shop | 200 | 725 | 915 | 500 | 688 | MISS |
| tenant /me | 200 | 719 | 908 | 702 | 885 | MISS |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
