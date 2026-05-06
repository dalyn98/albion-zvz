'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Pencil,
  Swords,
  Flame,
  Archive,
  Activity,
  Bell,
  Copy,
  Trash2,
  Play,
} from 'lucide-react'
import SearchBox from '@/components/SearchBox'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import type { DemoEventListItem } from '@/data/demo-seed'
import { formatTimeLabel } from '../_lib/format'

// `/admin/dashboard` 의 DashboardEventList 비주얼 클론.
// - 같은 active/ended 탭, 같은 SearchBox, 같은 카드 라이아웃.
// - 액션 버튼 (전투 시작 / 알림 / 편집 / 복제 / 삭제) 모두 disabled — 데모는 read-only.

type TabKey = 'active' | 'ended'

const DEFAULT_TAB: TabKey = 'active'

interface Props {
  events: DemoEventListItem[]
}

export default function DemoDashboardEventList({ events }: Props) {
  const t = useTranslations('adminDashboard')
  const tCommon = useTranslations('common')
  const tDemo = useTranslations('demo')
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB)
  const [search, setSearch] = useState('')

  const { activeEvents, endedEvents } = useMemo(() => {
    const active: DemoEventListItem[] = []
    const ended: DemoEventListItem[] = []
    for (const event of events) {
      if (event.status === 'ended') ended.push(event)
      else active.push(event)
    }
    return { activeEvents: active, endedEvents: ended }
  }, [events])

  const tabEvents = activeTab === 'active' ? activeEvents : endedEvents

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return tabEvents
    return tabEvents.filter(
      (e) => matchesName(e.name, q) || matchesName(e.zone, q),
    )
  }, [tabEvents, search])

  const tabs: Array<{
    key: TabKey
    labelKey: 'tabActive' | 'tabEnded'
    icon: React.ComponentType<{ size?: number; className?: string }>
    count: number
  }> = [
    { key: 'active', labelKey: 'tabActive', icon: Activity, count: activeEvents.length },
    { key: 'ended', labelKey: 'tabEnded', icon: Archive, count: endedEvents.length },
  ]

  const emptyKey = activeTab === 'active' ? 'noActiveEvents' : 'noEndedEvents'

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('tabsLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {tabs.map(({ key, labelKey, icon: Icon, count }) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t(labelKey)}
              <span className="text-[11px] text-gray-500 font-mono">{count}</span>
            </button>
          )
        })}
      </nav>

      <div role="tabpanel" className="space-y-3">
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            {search ? tCommon('searchNoResults') : t(emptyKey)}
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map((event) => (
              <EventRow key={event.id} event={event} t={t} tCommon={tCommon} tDemo={tDemo} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function EventRow({
  event,
  t,
  tCommon,
  tDemo,
}: {
  event: DemoEventListItem
  t: (key: string) => string
  tCommon: (key: string) => string
  tDemo: (key: string) => string
}) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-bold text-white truncate">{event.name}</span>
          {event.status === 'ended' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
              <Archive size={10} />
              {t('badgeEnded')}
            </span>
          ) : event.battleStarted ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
              <Swords size={10} />
              {t('badgeBattleActive')}
            </span>
          ) : event.kind === 'imminent' ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">
              <Flame size={10} />
              {t('badgeImminent')}
            </span>
          ) : null}
        </div>
        <p className="text-gray-400 text-sm truncate">
          {formatTimeLabel(tDemo, event.scheduledAt)} · {event.zone}
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
        <DemoIconButton
          ariaLabel={t('battleStart')}
          icon={<Play size={13} />}
          variant="amber"
        />
        <DemoIconButton
          ariaLabel={t('notifyTitle')}
          icon={<Bell size={13} />}
          variant="amber"
        />
        <DemoIconButton ariaLabel={tCommon('edit')} icon={<Pencil size={15} />} />
        <DemoIconButton ariaLabel={t('duplicate')} icon={<Copy size={13} />} />
        <DemoIconButton ariaLabel={tCommon('delete')} icon={<Trash2 size={15} />} variant="rose" />
      </div>
    </div>
  )
}

function DemoIconButton({
  icon,
  ariaLabel,
  variant = 'gray',
}: {
  icon: React.ReactNode
  ariaLabel: string
  variant?: 'gray' | 'amber' | 'rose'
}) {
  const styles =
    variant === 'amber'
      ? 'text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10'
      : variant === 'rose'
        ? 'text-rose-400/60 hover:text-rose-300 hover:bg-rose-500/10'
        : 'text-gray-400 hover:text-white hover:bg-gray-700'
  return (
    <button
      type="button"
      disabled
      aria-label={ariaLabel}
      className={`p-2 rounded-lg cursor-not-allowed ${styles}`}
    >
      {icon}
    </button>
  )
}
