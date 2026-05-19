---
name: i18n-parity-check
description: 4 locale (ko/ja/en/zh) JSON 메시지 파일의 키 동등성 검증. 메시지 파일 (`src/messages/{ko,ja,en,zh}.json`) 수정, 새 i18n 키 추가, 번역 누락 의심, 빌드 후 raw key (예: "demo.foo.bar") 가 UI 에 노출, "i18n 체크", "번역 동등성", "키 동기화", "메시지 검증" 같은 요청 시 자동 호출. super-admin/* 는 ko 단일 예외.
---

# i18n Parity Check

`src/messages/{ko,ja,en,zh}.json` 4 파일의 키 구조가 완전히 동등한지 검증.

## 활성화 조건

- 메시지 JSON 파일 직접 수정 후
- 새 i18n 키를 추가하는 코드 PR
- "i18n 동등성", "번역 동등", "키 동기화" 명시 요청
- 빌드 후 UI 에 raw key 가 보이는 버그 디버깅 중

## Phase 1 — 빠른 카운트 검증

먼저 카운트만 비교. 4 숫자가 같으면 1차 통과 (위치 다를 가능성 여전히 있음).

```bash
node -e "
const flat = (o, p='') => Object.entries(o).flatMap(([k,v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p+k+'.') : [p+k]
);
const [K, J, E, Z] = ['ko','ja','en','zh'].map(l =>
  flat(require('./src/messages/' + l + '.json')).sort()
);
console.log({ko: K.length, ja: J.length, en: E.length, zh: Z.length});
"
```

## Phase 2 — Diff 검증 (카운트 같아도 키 자체 다를 수 있음)

```bash
node -e "
const flat = (o, p='') => Object.entries(o).flatMap(([k,v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p+k+'.') : [p+k]
);
const [K, J, E, Z] = ['ko','ja','en','zh'].map(l =>
  new Set(flat(require('./src/messages/' + l + '.json')))
);
const all = new Set([...K, ...J, ...E, ...Z]);
const missing = (label, set) => [...all].filter(k => !set.has(k)).map(k => label + ': ' + k);
const out = [...missing('ko', K), ...missing('ja', J), ...missing('en', E), ...missing('zh', Z)];
if (out.length === 0) console.log('OK - all keys match');
else { console.log('MISMATCH:'); out.forEach(l => console.log('  ' + l)); process.exit(1); }
"
```

## Phase 3 — Super-admin 예외 처리

`superAdmin.*` 는 ko 단일언어 허용. 위 diff 에서 `ko: superAdmin.X` 만 나오면 무시 가능. ja/en/zh 측에서 `superAdmin.X` missing 도 무시 가능.

```bash
# 필터 적용 버전
node -e "
const flat = (o, p='') => Object.entries(o).flatMap(([k,v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p+k+'.') : [p+k]
);
const skip = (k) => k.startsWith('superAdmin.');
const [K, J, E, Z] = ['ko','ja','en','zh'].map(l =>
  new Set(flat(require('./src/messages/' + l + '.json')).filter(k => !skip(k)))
);
const all = new Set([...K, ...J, ...E, ...Z]);
const missing = (label, set) => [...all].filter(k => !set.has(k)).map(k => label + ': ' + k);
const out = [...missing('ko', K), ...missing('ja', J), ...missing('en', E), ...missing('zh', Z)];
if (out.length === 0) console.log('OK (superAdmin.* excluded)');
else { console.log('MISMATCH:'); out.forEach(l => console.log('  ' + l)); process.exit(1); }
"
```

## Phase 4 — Placeholder 변수명 동등성

키는 같아도 `{count}` vs `{件数}` 같은 변수명 mismatch 가 있으면 런타임 깨짐. 간단한 정규식으로 비교:

```bash
node -e "
const flat = (o, p='') => Object.entries(o).flatMap(([k,v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p+k+'.') : [[p+k, v]]
);
const vars = (s) => typeof s === 'string' ? [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',') : '';
const docs = ['ko','ja','en','zh'].map(l => Object.fromEntries(flat(require('./src/messages/' + l + '.json'))));
const allKeys = new Set(docs.flatMap(d => Object.keys(d)));
const bad = [];
for (const k of allKeys) {
  const sigs = docs.map(d => vars(d[k]));
  if (new Set(sigs).size > 1) bad.push(k + '  →  ' + sigs.join(' | '));
}
if (bad.length === 0) console.log('OK - placeholder vars consistent');
else { console.log('PLACEHOLDER MISMATCH:'); bad.forEach(l => console.log('  ' + l)); process.exit(1); }
"
```

## 보고 형식

성공:
> i18n 동등성 OK (ko/ja/en/zh 모두 N 키, placeholder 일치)

실패:
> i18n MISMATCH:
> - en: demo.craft.toastClaimed (missing)
> - placeholder: errors.tooMany → count,max | count | count,max | count,max
> → 어느 locale 에 무엇을 추가해야 하는지 정확히 짚어줄 것.
