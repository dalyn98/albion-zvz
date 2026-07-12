'use client'

import { Children, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { AuditLogCollapseLabels } from './AuditLogTableBody'

interface Props {
  children: ReactNode
  initialCount?: number
  labels: AuditLogCollapseLabels
}

/**
 * Mobile counterpart to AuditLogTableBody. Both views reveal the same initial
 * records and use the same labels, so switching breakpoints never changes the
 * audit trail a manager can inspect.
 */
export default function AuditLogMobileList({
  children,
  initialCount = 12,
  labels,
}: Props) {
  const entries = Children.toArray(children)
  const [expanded, setExpanded] = useState(false)
  const canCollapse = entries.length > initialCount
  const visibleEntries = expanded || !canCollapse ? entries : entries.slice(0, initialCount)

  return (
    <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900/60 sm:hidden">
      <div className="divide-y divide-gray-800">{visibleEntries}</div>
      {canCollapse && (
        <div className="flex flex-col gap-2 border-t border-gray-800 bg-gray-950/35 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[11px] text-gray-500">
            {expanded ? labels.expandedSummary : labels.collapsedSummary}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="inline-flex min-h-9 items-center justify-center gap-1 rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
          >
            {expanded ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            {expanded ? labels.collapse : labels.showAll}
          </button>
        </div>
      )}
    </div>
  )
}
