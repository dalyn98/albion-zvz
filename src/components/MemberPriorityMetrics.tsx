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
    <section
      data-tour-id={tourId}
      className="divide-y divide-border overflow-hidden rounded-xl bg-surface shadow-card ring-1 ring-border sm:grid sm:grid-cols-2 sm:divide-y-0"
    >
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
      className={`group flex min-h-24 items-center gap-3 px-4 py-3 transition-[background-color,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent active:scale-[0.99] sm:min-h-28 sm:border-r sm:border-border sm:px-5 ${tone.container}`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone.icon}`}>
        {item.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</p>
        <p className={`mt-0.5 break-words text-2xl font-extrabold leading-tight tabular-nums ${tone.value}`}>
          {item.value}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.sub}</p>
      </div>
      <ChevronRight
        size={18}
        aria-hidden="true"
        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
      />
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
        container: 'hover:bg-amber-500/8',
        icon: 'bg-amber-500/15 text-amber-300',
        value: 'text-amber-100',
      }
    case 'positive':
      return {
        container: 'hover:bg-emerald-500/8',
        icon: 'bg-emerald-500/15 text-emerald-300',
        value: 'text-emerald-100',
      }
    case 'negative':
      return {
        container: 'hover:bg-rose-500/8',
        icon: 'bg-rose-500/15 text-rose-300',
        value: 'text-rose-100',
      }
    case 'warning':
      return {
        container: 'hover:bg-yellow-500/8',
        icon: 'bg-yellow-500/15 text-yellow-200',
        value: 'text-yellow-100',
      }
    default:
      return {
        container: 'hover:bg-muted/50',
        icon: 'bg-muted text-muted-foreground',
        value: 'text-foreground',
      }
  }
}
