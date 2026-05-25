# /public/screenshots

마케팅 페이지(`/`, `/#features`)에서 사용하는 정적 fallback 스크린샷 자료를 보관합니다.
슈퍼어드민이 `/super-admin/marketing-screenshots` 에 실제 이미지를 업로드하면 DB 이미지가
우선 노출되고, DB 이미지가 없는 슬롯만 이 디렉터리의 fallback 을 사용합니다.

## 파일 명명 규칙

`src/lib/marketing-screenshots.ts` 의 키와 1:1 로 맞춥니다.

- `regear-approval-demo.png` — 자동 리기어 청구 또는 어드민 승인 화면
- `shop.png` — 길드 상점 카탈로그 또는 환전 화면
- `stats.png` — 멤버 통계 / 리더보드 / K/D 화면

## 권장 사양

- 비율: 16:9 (또는 4:3 도 허용 — 페이지마다 aspect 가 다름)
- 해상도: 1920×1080 권장, 최소 1280×720
- 형식: PNG 또는 JPG (투명도 필요 없음)
- 배경: 사이트가 다크 모드라 다크 캡쳐가 자연스럽음
- 민감 정보: 멤버 본명·Discord ID·실제 닉네임 노출 시 모자이크 또는 더미 데이터로 교체 권장

## 추가/교체 방법

1. 위 명명 규칙으로 PNG/JPG/WEBP 를 이 디렉터리에 저장.
2. `src/lib/marketing-screenshots.ts` 의 `fallbackMap()` 에 해당 슬롯 행을 추가합니다.
3. 슈퍼어드민 업로드 이미지가 없는 슬롯만 fallback 이미지로 표시됩니다.

fallback 이 없는 슬롯은 추상 프리뷰 + 라벨로 자리를 잡아 둡니다.
