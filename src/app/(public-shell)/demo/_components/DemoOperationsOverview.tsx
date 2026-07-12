import Link from 'next/link'
import type { ComponentType } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_ADMIN_BADGES, DEMO_MEMBERS } from '@/data/demo-seed'

type Tone = 'good' | 'warn' | 'danger' | 'info'

interface StatusCardConfig {
  key: string
  href: string
  icon: ComponentType<{ size?: number; className?: string }>
  tone: Tone
  title: string
  value: string
  detail: string
}

interface ActionItem {
  key: string
  tone: Tone
  title: string
  body: string
  href: string
  link: string
}

const DEMO_UNVERIFIED_IGN = new Set(['Borin', 'Vexa'])

function getDemoPendingTotal(): number {
  return Object.values(DEMO_ADMIN_BADGES).reduce((sum, count) => sum + count, 0)
}

export default async function DemoOperationsOverview() {
  const tOperations = await getTranslations('adminOperations')

  const pendingTotal = getDemoPendingTotal()
  const activeMembers = DEMO_MEMBERS.length
  const unverifiedMembers = DEMO_MEMBERS.filter((member) => DEMO_UNVERIFIED_IGN.has(member.ign)).length

  const cards: StatusCardConfig[] = [
    {
      key: 'pending',
      href: '/demo/regear',
      icon: ShieldCheck,
      tone: pendingTotal > 0 ? 'warn' : 'good',
      title: tOperations('pendingTitle'),
      value: pendingTotal > 0 ? tOperations('pendingValue', { count: pendingTotal }) : tOperations('pendingEmpty'),
      detail: tOperations('pendingDetail'),
    },
    {
      key: 'sync',
      href: '/demo/settings',
      icon: Activity,
      tone: 'good',
      title: tOperations('syncTitle'),
      value: tOperations('syncReady'),
      detail: tOperations('syncDetailAutoOn'),
    },
    {
      key: 'members',
      href: '/demo/stats',
      icon: Users,
      tone: unverifiedMembers > 0 ? 'info' : 'good',
      title: tOperations('membersTitle'),
      value:
        unverifiedMembers > 0
          ? tOperations('membersUnverified', { count: unverifiedMembers })
          : tOperations('membersReady'),
      detail: tOperations('membersDetail', { count: activeMembers }),
    },
  ]

  const actionItems: ActionItem[] = [
    {
      key: 'pending',
      tone: 'warn',
      title: tOperations('actionPendingTitle', { count: pendingTotal }),
      body: tOperations('actionPendingBody'),
      href: '/demo/regear',
      link: tOperations('actionPendingLink'),
    },
    {
      key: 'members',
      tone: 'info',
      title: tOperations('actionMembersTitle', { count: unverifiedMembers }),
      body: tOperations('actionMembersBody'),
      href: '/demo/stats',
      link: tOperations('actionMembersLink'),
    },
  ]

  return (
    <div className="space-y-6">
      <section data-tour-id="events-operations" className="space-y-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-soft-foreground">
            {tOperations('eyebrow')}
          </p>
          <h2 className="text-xl font-semibold text-foreground">{tOperations('title')}</h2>
          <p className="text-sm text-muted leading-relaxed max-w-3xl">{tOperations('description')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {cards.map(({ key, ...card }) => (
            <StatusCard key={key} {...card} openLabel={tOperations('openCard')} />
          ))}
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 sm:p-5 shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <Clock3 size={17} className="text-accent-soft-foreground" />
            <h3 className="text-sm font-semibold text-foreground">{tOperations('actionsTitle')}</h3>
          </div>
          <ul className="space-y-2">
            {actionItems.map(({ key, ...item }) => (
              <ActionRow key={key} {...item} />
            ))}
          </ul>
        </div>
      </section>
    </div>
  )
}

function toneClasses(tone: Tone): {
  border: string
  bg: string
  icon: string
  value: string
} {
  switch (tone) {
    case 'danger':
      return {
        border: 'border-rose-400/30',
        bg: 'bg-rose-500/5',
        icon: 'text-rose-300',
        value: 'text-rose-100',
      }
    case 'warn':
      return {
        border: 'border-amber-400/30',
        bg: 'bg-amber-500/5',
        icon: 'text-amber-300',
        value: 'text-amber-100',
      }
    case 'info':
      return {
        border: 'border-sky-400/30',
        bg: 'bg-sky-500/5',
        icon: 'text-sky-300',
        value: 'text-sky-100',
      }
    default:
      return {
        border: 'border-emerald-400/25',
        bg: 'bg-emerald-500/5',
        icon: 'text-emerald-300',
        value: 'text-emerald-100',
      }
  }
}

function StatusCard({
  href,
  icon: Icon,
  tone,
  title,
  value,
  detail,
  openLabel,
}: StatusCardConfig & {
  openLabel: string
}) {
  const cls = toneClasses(tone)
  return (
    <Link
      href={href}
      className={`group rounded-xl border ${cls.border} ${cls.bg} p-4 shadow-card transition-colors hover:border-accent/50`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-subtle">{title}</p>
          <p className={`mt-2 text-lg font-semibold ${cls.value}`}>{value}</p>
        </div>
        <Icon size={19} className={`${cls.icon} flex-shrink-0`} />
      </div>
      <p className="mt-2 text-xs text-muted leading-relaxed">{detail}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-soft-foreground group-hover:text-accent">
        {openLabel}
        <ArrowRight size={11} />
      </span>
    </Link>
  )
}

function ActionRow({ tone, title, body, href, link }: ActionItem) {
  const cls = toneClasses(tone)
  return (
    <li className={`rounded-lg border ${cls.border} ${cls.bg} px-3 py-3`}>
      <div className="flex items-start gap-2.5">
        {tone === 'danger' || tone === 'warn' ? (
          <AlertTriangle size={16} className={`${cls.icon} mt-0.5 flex-shrink-0`} />
        ) : (
          <CheckCircle2 size={16} className={`${cls.icon} mt-0.5 flex-shrink-0`} />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${cls.value}`}>{title}</p>
          <p className="text-xs text-muted leading-relaxed mt-1">{body}</p>
          <Link
            href={href}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-accent-soft-foreground hover:text-accent"
          >
            {link}
            <ArrowRight size={11} />
          </Link>
        </div>
      </div>
    </li>
  )
}
