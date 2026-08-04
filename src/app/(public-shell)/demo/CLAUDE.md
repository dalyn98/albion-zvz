# Demo Routes — Agent Rules

마케팅 데모 (`/demo/*`)는 실제 앱 전체를 복제하는 두 번째 앱이 아니다. 로그인 없이 제품의 대표 운영 흐름과 결과를 확인하는 **도입 체험용 샌드박스**다.

## 제품 의도

1. 모든 기능을 얕게 복제하지 않는다. 이벤트 공개 → 슬롯 신청 → 참가·보상 확정 → 리기어 → 제작·수령처럼 소수의 종단 간 시나리오에 집중한다.
2. 핵심 시나리오는 실제 제품의 용어, 역할, 허용 상태 전이, 필수 확인과 후속 업무를 따른다. 화면 밀도와 샘플 데이터 양은 단순화할 수 있다.
3. 데모 상태는 `DemoSessionProvider`와 `sessionStorage`에만 저장한다. 운영 DB, server action, Discord, outbox, 결제와 실제 길드 데이터에는 쓰지 않는다.
4. 같은 브라우저 세션의 새로고침에는 진행 상태가 유지되고, 새 브라우저 세션에는 이어지지 않는다. 명시적 초기화로 결정적 seed 상태를 복원한다.
5. 구현하지 않은 기능이나 실제 제품과 다른 제약을 체험 가능한 기능처럼 표시하지 않는다.

## 세 가지 화면 패턴

### (a) 핵심 시나리오

- `DemoSessionProvider`의 상태와 `src/lib/demo-journey.ts`의 typed command를 사용한다.
- 역할과 현재 상태가 맞지 않으면 command를 실행하지 않는다.
- 한 행동은 count, 다음 역할, 후속 업무와 완료 결과를 함께 바꾼다.
- `<DemoActionButton>`처럼 안내 toast로 끝나는 행동을 사용하지 않는다.

### (b) 부분 인터랙티브 쇼케이스

- 탭, 필터, 장바구니, 클레임처럼 기능 이해에 필요한 로컬 상태만 `'use client'` + `useState`/`useMemo`로 구현한다.
- 페이지를 떠나면 초기화되는 상태라면 그 사실을 사용자에게 오해 없이 보여준다.
- 예: `demo/craft/orders/page.tsx`.

### (c) 읽기 전용 기능 증거

- 백업, 감사, 고급 설정처럼 핵심 시나리오 밖의 기능은 샘플 결과와 실제 제공 범위를 보여준다.
- 저장·승인·삭제 버튼을 작동하는 것처럼 가장하지 않는다. 필요한 경우 기능 설명이나 도입 CTA로 연결한다.

## 필수 컴포넌트

- `_components/DemoSessionProvider.tsx` — 핵심 시나리오 상태의 세션 격리·복원·초기화.
- `_components/DemoFeedbackProvider.tsx` — 성공·초기화 피드백용 toast. 상태 전이 자체를 대신하지 않는다.
- `_components/DemoGuidedTour.tsx` — 페이지 발견 가이드. 기존 dialog ARIA 계약을 유지한다.

## i18n과 Client 경계

- 사용자 문구는 `demo.*` 키로 `ko/ja/en/zh.json`에 동일하게 등록한다.
- RSC에서 Client 컴포넌트로 `t()` 함수를 넘기지 않는다. Client에서 `useTranslations()`를 호출하거나 서버에서 문자열로 해석한다.
- 브라우저 저장소는 effect 이후 읽어 hydration 결과를 결정적으로 유지한다.
- seed에 `new Date()`나 `Math.random()`을 사용하지 않는다.

## 필수 검증

- 순수 상태 모델의 허용·금지 전이, 보상·리기어 분리, 손상 세션 복구 단위 테스트.
- 브라우저에서 전체 역할 흐름, 중간 새로고침 복원, 새 세션 격리, 초기화 확인.
- 핵심 시나리오 실행 중 운영 API mutation이 없는지 확인.
- i18n 키·placeholder 동등성, typecheck, 데모 route smoke.
