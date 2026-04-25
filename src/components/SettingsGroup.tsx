import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  hint?: string
  children: ReactNode
}

// 비슷한 역할의 설정들을 시각적으로 묶는 외곽 카드. 하위 항목은 자체 카드 없이
// 사이만 divider 로 구분돼 시선이 그룹 단위로 정리된다. 하위 항목이 자체
// 카드를 그리면 카드-인-카드 가 되어 시각적으로 어수선해지므로, 자식
// 컴포넌트는 `embedded` 모드 (외곽 카드/배경 없음) 로 렌더해야 한다.
export default function SettingsGroup({ title, description, hint, children }: Props) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{title}</h2>
        {description && <p className="text-gray-500 text-xs mt-1">{description}</p>}
        {hint && <p className="text-amber-400/80 text-xs mt-1">{hint}</p>}
      </div>
      <div className="space-y-5 divide-y divide-gray-800 [&>*:not(:first-child)]:pt-5">
        {children}
      </div>
    </div>
  )
}
