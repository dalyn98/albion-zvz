import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export type MemberPriorityMetricTone =
  | 'points'
  | 'positive'
  | 'negative'
  | 'warning'
  | 'neutral'

export interface MemberPriorityMetricItem {
  href: string
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  tone: MemberPriorityMetricTone
}

interface Props {
  items: readonly MemberPriorityMetricItem[]
  tourId?: string
}

export default function MemberPriorityMetrics({ items, tourId }: Props) {
  return (
    <section data-tour-id={tourId} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((item) => (
        <PriorityMetricLink key={item.label} item={item} />
      ))}
    </section>
  )
}

function PriorityMetricLink({ item }: { item: MemberPriorityMetricItem }) {
  const tone = getToneClasses(item.tone)

  return (
    <Link
      href={item.href}
      className={`group min-h-36 rounded-2xl border px-4 py-4 transition-colors sm:px-5 ${tone.container}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}>
          {item.icon}
        </div>
        <ChevronRight
          size={18}
          className="shrink-0 text-gray-500 transition-colors group-hover:text-amber-300"
        />
      </div>
      <div className="mt-4 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {item.label}
        </p>
        <p className={`mt-1 break-words text-3xl font-black leading-tight sm:text-4xl ${tone.value}`}>
          {item.value}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-gray-400">{item.sub}</p>
      </div>
    </Link>
  )
}

function getToneClasses(tone: MemberPriorityMetricTone): {
  container: string
  icon: string
  value: string
} {
  switch (tone) {
    case 'points':
      return {
        container: 'border-amber-500/35 bg-amber-500/10 hover:border-amber-400/60',
        icon: 'bg-amber-500/15 text-amber-300',
        value: 'text-amber-100',
      }
    case 'positive':
      return {
        container: 'border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-400/60',
        icon: 'bg-emerald-500/15 text-emerald-300',
        value: 'text-emerald-100',
      }
    case 'negative':
      return {
        container: 'border-rose-500/40 bg-rose-500/10 hover:border-rose-400/60',
        icon: 'bg-rose-500/15 text-rose-300',
        value: 'text-rose-100',
      }
    case 'warning':
      return {
        container: 'border-yellow-500/35 bg-yellow-500/10 hover:border-yellow-400/60',
        icon: 'bg-yellow-500/15 text-yellow-200',
        value: 'text-yellow-100',
      }
    default:
      return {
        container: 'border-gray-700 bg-gray-900 hover:border-amber-500/40',
        icon: 'bg-gray-800 text-gray-300',
        value: 'text-white',
      }
  }
}
