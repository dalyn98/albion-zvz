'use client'

import { Children, useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronUp } from 'lucide-react'

type CollapsibleListUnit = 'members' | 'items'

interface Props {
  children: ReactNode
  // 접힌 상태에서 보여줄 행 수. 총 개수가 이보다 작거나 같으면 토글 버튼은
  // 렌더되지 않는다.
  initialCount?: number
  // ol 은 순위가 있는 상위 N, ul 은 일반 목록.
  as?: 'ol' | 'ul'
  className?: string
  // "더보기" 문구에 붙는 단위 키. 'members' = 사람 수, 'items' = 개수 단위.
  // 미지정 시 일반(generic) 문구로 폴백.
  unit?: CollapsibleListUnit
}

export default function CollapsibleList({
  children,
  initialCount = 8,
  as = 'ul',
  className = '',
  unit,
}: Props) {
  const t = useTranslations('collapsibleList')
  const items = Children.toArray(children)
  const [expanded, setExpanded] = useState(false)
  const total = items.length
  const canCollapse = total > initialCount
  const shown = expanded || !canCollapse ? items : items.slice(0, initialCount)
  const remaining = total - initialCount
  const Tag = as

  const moreKey =
    unit === 'members' ? 'moreMembers' : unit === 'items' ? 'moreItems' : 'moreGeneric'
  const resolvedMore = t(moreKey, { count: remaining.toLocaleString() })
  const lessLabel = t('less')

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
