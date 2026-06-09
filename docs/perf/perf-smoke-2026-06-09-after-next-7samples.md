# 배포 후 성능 측정 7샘플

- 측정 시각: 2026-06-09T09:33:44.186Z
- 샘플 수: 7

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| public /features | 200 | 267 | 448 | 252 | 262 | MISS |
| public /pricing | 200 | 267 | 449 | 245 | 340 | MISS |
| public /faq | 200 | 258 | 441 | 230 | 260 | MISS |
| tenant /members | 200 | 700 | 882 | 663 | 849 | MISS |
| tenant /regear | 200 | 771 | 958 | 680 | 866 | MISS |
| tenant /shop | 200 | 486 | 680 | 481 | 490 | MISS |
| tenant /me | 200 | 689 | 877 | 682 | 863 | MISS |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
