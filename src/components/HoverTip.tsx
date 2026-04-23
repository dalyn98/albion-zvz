import type { ReactNode } from 'react'

type Placement = 'top' | 'bottom' | 'left' | 'right'

interface Props {
  label: string
  placement?: Placement
  children: ReactNode
  // 감싸는 wrapper 에 추가할 클래스. 기본은 inline-flex — 아이콘/칩 같은 인라인
  // trigger 에 맞다. 타일 내부의 full-width 배너처럼 block 레벨로 쓸 때는
  // "block w-full" 같은 값을 넘겨서 레이아웃이 깨지지 않게 한다.
  triggerClassName?: string
}

const PLACEMENT_CLASS: Record<Placement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-1.5',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-1.5',
  left: 'right-full top-1/2 -translate-y-1/2 mr-1.5',
  right: 'left-full top-1/2 -translate-y-1/2 ml-1.5',
}

// OS 기본 title 툴팁 대신 쓰는 경량 호버 팁. CSS group-hover / group-focus-within
// 만으로 동작하므로 client 경계 없이 어디든 쓸 수 있다. 단, 조상에 overflow-hidden
// 이 있으면 툴팁이 잘린다 — 그런 컨테이너(예: 상점 타일) 에서는 clip 을 깨주는
// 래퍼를 먼저 둔 뒤 이 컴포넌트를 써야 한다.
export default function HoverTip({
  label,
  placement = 'bottom',
  children,
  triggerClassName,
}: Props) {
  return (
    <span
      tabIndex={0}
      className={`relative group/hovertip outline-none ${triggerClassName ?? 'inline-flex items-center'}`}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${PLACEMENT_CLASS[placement]} max-w-[min(18rem,80vw)] whitespace-normal bg-gray-950/95 border border-gray-700 text-gray-100 text-[11px] leading-snug rounded-md px-2.5 py-1.5 shadow-xl opacity-0 invisible group-hover/hovertip:opacity-100 group-hover/hovertip:visible group-focus-within/hovertip:opacity-100 group-focus-within/hovertip:visible transition-opacity`}
      >
        {label}
      </span>
    </span>
  )
}
