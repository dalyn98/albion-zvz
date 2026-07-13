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
      aria-label={label}
      className={`relative group/hovertip outline-none ${triggerClassName ?? 'inline-flex items-center'}`}
    >
      {children}
      {/* w-max 는 shrink-to-fit 기본 동작(좁은 trigger 안에서 tooltip 이 세로
          스트립으로 쪼그라드는 현상) 을 끄고 내용 폭을 따라가게 한다. 숨겨진
          absolute 요소도 모바일 문서 폭을 넓힐 수 있으므로, 비활성 때는 display:
          none 으로 제외한다. */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 hidden ${PLACEMENT_CLASS[placement]} w-max max-w-[min(18rem,calc(100vw-2rem))] whitespace-normal break-keep bg-gray-950/95 border border-gray-700 text-gray-100 text-[12px] leading-relaxed rounded-md px-3 py-2 shadow-xl group-hover/hovertip:block group-focus-within/hovertip:block`}
      >
        {label}
      </span>
    </span>
  )
}
