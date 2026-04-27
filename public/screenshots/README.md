# /public/screenshots

마케팅 페이지(`/landing`, `/features`)에서 사용하는 스크린샷 자료를 보관합니다.

## 파일 명명 규칙

`src/lib/marketing-screenshots.ts` 의 키와 1:1 로 맞춥니다.

- `events.png` — 이벤트 모집판 / 파티 빌드 화면
- `regear.png` — 자동 리기어 청구 또는 어드민 승인 화면
- `shop.png` — 길드 상점 카탈로그 또는 환전 화면
- `stats.png` — 멤버 통계 / 리더보드 / K/D 화면

## 권장 사양

- 비율: 16:9 (또는 4:3 도 허용 — 페이지마다 aspect 가 다름)
- 해상도: 1920×1080 권장, 최소 1280×720
- 형식: PNG 또는 JPG (투명도 필요 없음)
- 배경: 사이트가 다크 모드라 다크 캡쳐가 자연스럽음
- 민감 정보: 멤버 본명·Discord ID·실제 닉네임 노출 시 모자이크 또는 더미 데이터로 교체 권장

## 추가/교체 방법

1. 위 명명 규칙으로 PNG 를 이 디렉터리에 저장.
2. `src/lib/marketing-screenshots.ts` 에서 해당 키의 값을 `null` → `'/screenshots/<slot>.png'` 으로 변경.
3. 저장하면 점선 placeholder 가 실제 이미지로 자동 전환된다.

이미지가 없는 슬롯은 점선 박스 + 라벨로 자리를 잡아 두므로 어색하지 않습니다.
