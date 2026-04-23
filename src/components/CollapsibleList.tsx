'use client'

import { Children, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface Props {
  children: ReactNode
  // 접힌 상태에서 보여줄 행 수. 총 개수가 이보다 작거나 같으면 토글 버튼은
  // 렌더되지 않는다.
  initialCount?: number
  // ol 은 순위가 있는 상위 N, ul 은 일반 목록.
  as?: 'ol' | 'ul'
  className?: string
  // "더보기" 문구에 붙는 단위. 예: "명", "개". 미설정 시 단위 없이 "N개 더 보기".
  unit?: string
  moreLabel?: string
  lessLabel?: string
}

export default function CollapsibleList({
  children,
  initialCount = 8,
  as = 'ul',
  className = '',
  unit,
  moreLabel,
  lessLabel = '접기',
}: Props) {
  const items = Children.toArray(children)
  const [expanded, setExpanded] = useState(false)
  const total = items.length
  const canCollapse = total > initialCount
  const shown = expanded || !canCollapse ? items : items.slice(0, initialCount)
  const remaining = total - initialCount
  const Tag = as

  const resolvedMore =
    moreLabel ?? `${remaining.toLocaleString()}${unit ?? '개'} 더 보기`

  return (
    <>
      <Tag className={className}>{shown}</Tag>
      {canCollapse && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full flex items-center justify-center gap-1 text-[11px] font-medium text-gray-400 hover:text-white hover:bg-gray-800/40 py-2 border-t border-gray-800 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> {lessLabel}
            </>
          ) : (
            <>
              <ChevronDown size={12} /> {resolvedMore}
            </>
          )}
        </button>
      )}
    </>
  )
}
