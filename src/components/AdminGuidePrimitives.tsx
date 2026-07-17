import Link from 'next/link'
import {
  CalendarCog,
  Database,
  Library,
  ListChecks,
  Rocket,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react'
import { SequenceSurface } from '@/components/ui-patterns'

export type AdminGuideCategoryTitleKey =
  | 'gettingStarted'
  | 'events'
  | 'regear'
  | 'community'
  | 'data'
  | 'reference'

export interface AdminGuideCategoryDef {
  id: string
  icon: React.ReactNode
  titleKey: AdminGuideCategoryTitleKey
  sectionIds: readonly string[]
}
export const ADMIN_GUIDE_CATEGORIES: ReadonlyArray<AdminGuideCategoryDef> = [
  {
    id: 'getting-started',
    icon: <Rocket size={16} className="text-emerald-400" />,
    titleKey: 'gettingStarted',
    sectionIds: ['quickStart', 'roleLoops'],
  },
  {
    id: 'events',
    icon: <CalendarCog size={16} className="text-amber-400" />,
    titleKey: 'events',
    sectionIds: ['eventLifecycle', 'onboarding', 'timezone', 'bombSquad'],
  },
  {
    id: 'regear',
    icon: <ShieldCheck size={16} className="text-amber-400" />,
    titleKey: 'regear',
    sectionIds: ['regear', 'craftRegear'],
  },
  {
    id: 'community',
    icon: <ShoppingBag size={16} className="text-amber-400" />,
    titleKey: 'community',
    sectionIds: ['shop', 'siphon', 'lootAudit', 'notifications'],
  },
  {
    id: 'data',
    icon: <Database size={16} className="text-amber-400" />,
    titleKey: 'data',
    sectionIds: ['battles', 'stats'],
  },
  {
    id: 'reference',
    icon: <Library size={16} className="text-amber-400" />,
    titleKey: 'reference',
    sectionIds: ['tips', 'troubleshooting'],
  },
] as const

export function AdminGuideToc({
  title,
  titleFor,
}: {
  title: string
  titleFor: (key: AdminGuideCategoryTitleKey) => string
}) {
  return (
    <nav className="border-y border-border bg-surface/70 px-4 py-4">
      <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
        <ListChecks size={14} className="text-amber-300" />
        {title}
      </h2>
      <ul className="mt-3 grid grid-cols-1 gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_GUIDE_CATEGORIES.map((category) => (
          <li key={category.id} className="bg-surface">
            <a
              href={`#${category.id}`}
              className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-surface-2 hover:text-amber-200"
            >
              {category.icon}
              <span className="min-w-0 break-words">{titleFor(category.titleKey)}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function AdminGuideCategoryHeader({
  icon,
  title,
}: {
  icon: React.ReactNode
  title: string
}) {
  return (
    <div className="flex items-center gap-2 border-l-2 border-amber-500/40 py-1 pl-3">
      {icon}
      <h2 className="text-sm font-bold uppercase tracking-wider text-amber-200">{title}</h2>
    </div>
  )
}

export function AdminGuideTroubleEntry({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="border-l-2 border-danger/40 bg-danger-soft/40 px-3 py-3">
      <dt className="mb-1 font-semibold text-white">{term}</dt>
      <dd className="leading-relaxed text-gray-300">{desc}</dd>
    </div>
  )
}

export function AdminGuideSection({
  icon,
  title,
  href,
  linkLabel,
  children,
}: {
  icon: React.ReactNode
  title: string
  href?: string
  linkLabel?: string
  children: React.ReactNode
}) {
  return (
    <SequenceSurface className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <h3 className="flex min-w-0 items-center gap-2 text-base font-bold text-white">
          {icon}
          <span className="break-words">{title}</span>
        </h3>
        {href && linkLabel && (
          <Link
            href={href}
            className="inline-flex min-h-10 shrink-0 items-center self-start text-xs text-amber-300 hover:text-amber-200"
          >
            {linkLabel} →
          </Link>
        )}
      </div>
      <div>{children}</div>
    </SequenceSurface>
  )
}
