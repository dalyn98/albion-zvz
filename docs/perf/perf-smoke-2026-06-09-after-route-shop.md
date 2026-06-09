# 4차 최적화 배포 후 성능 측정

- 측정 시각: 2026-06-09T10:11:27.855Z
- 샘플 수: 7

| 경로 | Status | Median TTFB(ms) | Median Total(ms) | Best TTFB(ms) | Best Total(ms) | Vercel Cache |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| public /features | 200 | 255 | 440 | 237 | 417 | MISS |
| public /pricing | 200 | 247 | 427 | 243 | 253 | MISS |
| public /faq | 200 | 245 | 427 | 234 | 242 | MISS |
| tenant /members | 200 | 242 | 1126 | 232 | 700 | MISS |
| tenant /regear | 200 | 251 | 1117 | 243 | 722 | MISS |
| tenant /shop | 200 | 249 | 684 | 243 | 485 | MISS |
| tenant /me | 200 | 236 | 1041 | 231 | 867 | MISS |

## Notes

- TTFB는 응답 헤더가 도착한 시점까지의 시간입니다.
- 쿠키 파일을 사용해도 쿠키 값은 이 보고서에 기록하지 않습니다.
