# 배포 전 성능 측정

- 측정 시각: 2026-06-09T09:28:07.715Z
- 샘플 수: 3

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| public /features | 200 | 268 | 448 | 266 | 281 | MISS |
| public /pricing | 200 | 361 | 528 | 246 | 427 | MISS |
| public /faq | 200 | 267 | 453 | 259 | 443 | MISS |
| tenant /members | 200 | 731 | 1293 | 694 | 1042 | MISS |
| tenant /regear | 200 | 944 | 1325 | 695 | 1251 | MISS |
| tenant /shop | 200 | 479 | 673 | 465 | 648 | MISS |
| tenant /me | 200 | 711 | 1256 | 704 | 1080 | MISS |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
