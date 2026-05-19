# i18n Messages — Agent Rules

`ko.json` / `ja.json` / `en.json` / `zh.json` 4개 파일은 항상 키 구조가 **완전히 동등**해야 한다. 한 키 추가 = 4 파일 모두 수정.

## Hard rules

1. **4-locale 동등성.** 키 누락 / 키 추가 / 중첩 깊이 차이 모두 빌드는 통과해도 런타임에 fallback 으로 잘못된 언어가 노출됨. PR 머지 전 키 diff 0 여야 한다.
2. **Edit 전에 Read 필수.** Claude Code Edit tool 은 "File has not been read yet" 에러로 막힌다. 4 파일 모두 한 번씩 Read 후 Edit. (Phase 10 `bulkRegearTooMany` 추가할 때 ja/en/zh 에서 3번 연속 막혔던 실수.)
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
9) Verify: node -e "const k=require('./src/messages/ko.json'),j=require('./src/messages/ja.json'),e=require('./src/messages/en.json'),z=require('./src/messages/zh.json'); const flat=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'?flat(v,p+k+'.'):[p+k]); const [K,J,E,Z]=[k,j,e,z].map(flat); console.log({ko:K.length,ja:J.length,en:E.length,zh:Z.length})"
   → 4 숫자 모두 같으면 OK
```

위 verify 명령은 `i18n-parity-check` 스킬에 자동 노출. 손으로 매번 칠 필요 X.

## 추가 가이드

- **번역 톤** — ko: 격식 존댓말 / ja: 丁寧語 / en: concise UI English / zh: 简体중국어 정식.
- **알비온 고유명사** — ko/ja/zh 는 음차, en 은 원문 유지 (예: "Black Zone" / "ブラックゾーン" / "黑区" / "Black Zone").
- **superAdmin.* 외에 ko 단일 등재가 발견되면 4 파일로 채우거나 키 삭제.**

## 회귀 위험

- next-intl 4 는 missing key 일 때 silent fallback (key 문자열 그대로 노출). 사용자에 "demo.craft.toastClaimed" 같은 raw key 가 보이면 추가 누락 신호.
- JSON syntax 깨지면 빌드 즉시 실패. 마지막 `,` 빠뜨림 주의.

관련 스킬: `i18n-parity-check` (자동 검증 가능).
