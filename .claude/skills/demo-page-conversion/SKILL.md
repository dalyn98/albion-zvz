---
name: demo-page-conversion
description: 마케팅 데모 (`/demo/*`) 의 정적 server-rendered 페이지를 인터랙티브 'use client' 페이지로 전환. 상태 변화 (탭/필터/클레임/체크박스) 가 필요한 데모 화면 작성, "데모 인터랙티브 만들어줘", "demo 페이지 살아있게", "use client 전환" 요청 시 자동 호출. RSC→Client 전환의 함정 (t() prop 금지, hydration mismatch, useTranslations 위치) 을 한 번에 처리.
---

# Demo Page Conversion

`/demo/*` 의 정적 RSC 페이지 → 상태 있는 client 페이지로 전환. 사용자가 "실제 앱처럼" 체험할 수 있게 만든다.

## 활성화 조건

- 데모 페이지에 탭/필터/입력/카운터/상태 토글 추가
- "데모 인터랙티브 만들어줘", "use client 전환", "demo 살아있게"
- Phase 9-10 craft/orders, members, settings 패턴 따라할 때

## Phase 1 — 어떤 패턴인지 판정

| 변경 범위 | 권장 패턴 |
| --- | --- |
| 클릭만 토스트 띄우면 됨 | RSC 유지 + `<DemoActionButton>` |
| 탭/필터/카운터 (state 변화) | `'use client'` 전체 전환 |
| 일부만 상태 있음 | RSC 페이지 + Client 컴포넌트 분리 |

대부분의 "마치 진짜 앱처럼" 케이스는 두 번째.

## Phase 2 — 전환 템플릿

```tsx
'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useDemoToast } from '../../_components/DemoFeedbackProvider'

type Tab = 'available' | 'mine'
interface RowData {
  id: string
  /* ... */
}

const INITIAL_ROWS: ReadonlyArray<RowData> = [
  /* hard-coded demo data */
]

export default function DemoXxxPage() {
  const t = useTranslations('demo.xxx')
  const { showToast } = useDemoToast()
  const [rows, setRows] = useState<ReadonlyArray<RowData>>(INITIAL_ROWS)
  const [tab, setTab] = useState<Tab>('available')

  const filtered = useMemo(() => rows.filter(...), [rows, tab])

  const handleAction = (row: RowData) => {
    setRows((prev) => prev.map((r) => r.id === row.id ? { ...r, ... } : r))
    showToast(t('toastDone'))
  }

  return (
    <main>
      {/* tabs, list, modal, etc. */}
    </main>
  )
}
```

## Phase 3 — 흔한 함정 체크

1. **RSC → Client 로 `t()` 함수 prop 전달 금지.** 배포 후 500. Client 측에서 `useTranslations()` 직접 호출하거나, 서버에서 미리 string 으로 풀어 prop 으로 넘김.
2. **하드코딩 한국어 금지.** 모든 라벨은 `t('...')` 로. ko/ja/en/zh 4 파일 동등 추가. `i18n-parity-check` 스킬로 검증.
3. **불변 업데이트만.** `setRows(prev => prev.map(r => ...))` — `r.field = ...` 같은 직접 mutation 금지.
4. **`disabled` 처리 통일.** `<DemoActionButton disabled={...}>` 가 keyDown/focus 차단까지 다 해줌. 별도로 onClick 안 막아도 됨.
5. **Hydration mismatch 주의.** `INITIAL_ROWS` 안에 `new Date()` / `Math.random()` 같은 비결정 값 박지 말 것. 상수만.
6. **page.tsx 가 'use client' 면 RSC-only API (예: `getTranslations` async, server actions) 금지.**

## Phase 4 — 정리 체크리스트

- [ ] `'use client'` 헤더
- [ ] state hooks (`useState`, `useMemo`)
- [ ] `useDemoToast()` 로 진행 안내
- [ ] 모든 라벨 i18n 화 + 4 locale 등재
- [ ] `useTranslations('demo.<page>')` 사용
- [ ] `INITIAL_*` 데이터 결정적 (Date/random 금지)
- [ ] tsc clean (`npx tsc --noEmit`)
- [ ] 데모 페이지 수동 클릭 확인 (탭 전환, 액션 토스트)

## 참고 구현

- `src/app/demo/craft/orders/page.tsx` — Phase 10 에서 가장 완성도 높게 작성된 인터랙티브 데모. 새 데모 만들 때 시작점으로 복사.
- `src/app/demo/_components/DemoActionButton.tsx` — disabled prop 포함, keyDown/focus 차단 처리 완료.
- `src/app/demo/_components/DemoFeedbackProvider.tsx` — `useDemoToast()` 의 토스트 viewport.

관련: [[demo CLAUDE.md]] `/Users/dalyn1234/projects/albion-zvz/src/app/demo/CLAUDE.md`.
