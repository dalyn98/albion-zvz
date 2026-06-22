'use client'

import { Children, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface AuditLogTableBodyLabels {
  collapse: string
  collapsedSummary: string
  expandedSummary: string
  showAll: string
}

interface Props {
  children: ReactNode
  className?: string
  colSpan: number
  initialCount?: number
  labels: AuditLogTableBodyLabels
}

export default function AuditLogTableBody({
  children,
  className = '',
  colSpan,
  initialCount = 12,
  labels,
}: Props) {
  const rows = Children.toArray(children)
  const [expanded, setExpanded] = useState(false)
  const total = rows.length
  const canCollapse = total > initialCount
  const shownRows = expanded || !canCollapse ? rows : rows.slice(0, initialCount)

  if (!canCollapse) {
    return <tbody className={className}>{rows}</tbody>
  }

  return (
    <tbody className={className}>
      {shownRows}
      <tr className="bg-gray-950/35">
        <td colSpan={colSpan} className="px-3 py-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[11px] text-gray-500">
              {expanded ? labels.expandedSummary : labels.collapsedSummary}
            </span>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
            >
              {expanded ? (
                <ChevronUp size={14} aria-hidden="true" />
              ) : (
                <ChevronDown size={14} aria-hidden="true" />
              )}
              {expanded ? labels.collapse : labels.showAll}
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  )
}
