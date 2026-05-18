# Demo Routes — Agent Rules

마케팅 데모 (`/demo/*`). 실제 어드민 UI 와 시각·인터랙션이 같아야 한다 — 사용자는 클릭/타이핑해보고 "실제 앱처럼 작동한다" 는 인상을 받아야 한다.

## 핵심 원칙

1. **데모는 가짜가 아니라 "저장만 안 되는 진짜"**. 버튼/탭/필터/입력은 모두 상태가 바뀌고 토스트가 뜨는 식으로 응답해야 한다. `disabled` 한 정적 화면은 금지.
2. **저장 액션은 DB 안 친다.** Server action 호출 X. 클릭 시 `useDemoToast().showToast(...)` 로 "데모이므로 저장되지 않아요" 표시만.

## 두 가지 페이지 패턴

### (a) Server-rendered 쇼케이스 (정적 데이터 + 가짜 버튼)

리스트/카드를 RSC 로 렌더, 인터랙션은 `<DemoActionButton>` 에 위임.

```tsx
// page.tsx (RSC, no 'use client')
import DemoActionButton from '../_components/DemoActionButton'

<DemoActionButton className="...">승인</DemoActionButton>
```

- 클릭 시 자동으로 토스트가 뜸. `disabled` prop 으로 진짜 비활성 표현 가능 (포커스/키보드 차단까지 처리됨).

### (b) Full client interactive (탭/필터/폼)

상태 변화가 필요한 페이지는 `'use client'` 로 전환하고 `useState`/`useMemo` 로 직접 관리. 예: `demo/craft/orders/page.tsx` — 주문 클레임/반환/딜리버 상태 흐름.

```tsx
'use client'
import { useMemo, useState } from 'react'
import { useDemoToast } from '../../_components/DemoFeedbackProvider'

const [orders, setOrders] = useState<ReadonlyArray<OrderRow>>(INITIAL_ORDERS)
const claimOrder = (o: OrderRow) => {
  setOrders((prev) => prev.map(...))   // 불변 업데이트
  showToast(t('toastClaimed'))
}
```

이 패턴이면 `useTranslations()` 클라 측에서 직접 호출. RSC → Client 로 `t()` prop 전달 금지 (배포 후 500).

## 필수 컴포넌트

- `_components/DemoFeedbackProvider.tsx` — `<DemoToastContext>` 제공. `_components/DemoActionButton.tsx` 가 의존. demo layout 에서 한 번 wrap.
- `_components/DemoGuidedTour.tsx` — 첫 방문 가이드. dialog 패턴 (`aria-modal`, `aria-labelledby`, `aria-describedby`) 가 박혀 있음, 새로 만들 때 같은 ARIA 셋 유지.

## i18n

- 데모 텍스트는 모두 `demo.*` 키로 `ko/ja/en/zh.json` 동일 등재. 4-locale 동등성은 hard rule. [[messages CLAUDE.md]] 참고.

## 회귀 위험

- "RSC + onClick 직접" 은 빌드 시 에러. 인터랙션 필요하면 `'use client'` 또는 `DemoActionButton` 으로 격리.
- 가짜 disabled 효과는 `opacity-50` 만 두지 말 것 — dashed border + grayscale + aria-disabled + tabIndex=-1 까지 묶어야 사용자에 "비활성" 으로 읽힌다 (Phase 10 craft range input 사례).
