# i18n Messages — Agent Rules

`src/i18n/locales.ts`의 `SUPPORTED_LOCALES`에 대응하는 모든 JSON 파일은 키 구조가 **완전히 동등**해야 한다. 한 키 추가 = 17개 파일 모두 수정.

## Hard rules

1. **4-locale 동등성.** 키 누락 / 키 추가 / 중첩 깊이 차이 모두 빌드는 통과해도 런타임에 fallback 으로 잘못된 언어가 노출됨. PR 머지 전 키 diff 0 여야 한다.
2. **Edit 전에 Read 필수.** 변경할 namespace와 locale 계약을 먼저 확인한다.
3. **Super-admin/* 예외.** `superAdmin.*` 키는 운영자 전용이라 `ko.json` 단일 등재 허용. 다른 모든 키는 4 locale 동등.
4. **placeholder 변수명 동일.** `{count}` / `{max}` / `{name}` 같은 변수 이름이 4 locale 에서 똑같이 등장해야 한다. ja 만 `{件数}` 같은 로컬라이즈된 변수명 금지.
5. **키 순서 가급적 맞추기.** 빌드는 무관하지만 diff/리뷰가 편하다. 새 키는 같은 섹션 안에서 4 파일 모두 같은 위치에 삽입.

## Add-key 워크플로

```
1) Read ko.json (Find anchor 섹션)
2) Read ja.json
3) Read en.json
4) Read zh.json
5) Edit ko.json — anchor 다음 라인에 새 키 추가
6) Edit ja.json — 같은 anchor 다음 라인
7) Edit en.json — 같은 anchor 다음 라인
8) Edit zh.json — 같은 anchor 다음 라인
9) Verify: `npx vitest run src/messages/i18n-parity.test.ts`
   → 4 숫자 모두 같으면 OK
```

위 verify 명령은 `i18n-parity-check` 스킬에 자동 노출. 손으로 매번 칠 필요 X.

## 추가 가이드

- **번역 톤** — 각 언어의 간결하고 자연스러운 게임 유틸리티 UI 문체를 사용한다.
- **알비온 고유명사** — 공식 Albion 현지화 이름과 커뮤니티에서 통용되는 ZvZ 용어를 우선하고, 아이템명은 공식 `LocalizedNames`를 사용한다.
- **superAdmin.* 외에 ko 단일 등재가 발견되면 4 파일로 채우거나 키 삭제.**

## 회귀 위험

- next-intl 4 는 missing key 일 때 silent fallback (key 문자열 그대로 노출). 사용자에 "demo.craft.toastClaimed" 같은 raw key 가 보이면 추가 누락 신호.
- JSON syntax 깨지면 빌드 즉시 실패. 마지막 `,` 빠뜨림 주의.

관련 스킬: `i18n-parity-check` (자동 검증 가능).
