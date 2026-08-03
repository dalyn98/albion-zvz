'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  ArrowUpRight,
  ChevronDown,
  Clock,
  Crosshair,
  Layers3,
  Search,
  Shield,
  Skull,
  Swords,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'
import ItemImage from '@/components/ItemImage'
import { useBodyScrollLock } from '@/components/useBodyScrollLock'
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales'
import { formatDateTime, formatTime } from '@/lib/format-datetime'
import { useItemNameResolver } from '@/lib/item-names-client'
import { formatKillbotCompactFame } from '@/lib/killbot-battle'
import {
  PUBLIC_BATTLE_EQUIPMENT_SLOTS,
  type PublicBattleAnalysisActor,
  type PublicBattleAnalysisEquipment,
  type PublicBattleAnalysisEvent,
  type PublicBattleAnalysisPlayer,
  type PublicBattleGroupAnalysis,
} from '@/lib/public-battle-analysis-model'
import type {
  PublicBattleGroupForceLine,
  PublicBattleGroupPlayerBattleLine,
  PublicBattleGroupReport,
} from '@/lib/public-battle-report-model'
import { extractWeaponCategory } from '@/lib/weapon-category'

type GroupLevel = 'forces' | 'alliances' | 'guilds'
type PlayerSort = 'kills' | 'fame' | 'damage' | 'healing' | 'name'

interface SelectedGroup {
  level: GroupLevel
  key: string
}

interface ScopedPlayer extends PublicBattleAnalysisPlayer {
  scopedKills: number
  scopedDeaths: number
  scopedFame: number
  scopedDamage: number
  scopedHealing: number
  scopedItemPower: number | null
  scopedWeaponId: string | null
  scopedEquipment: PublicBattleAnalysisEquipment | null
}

const PLAYER_PAGE_SIZE = 20
const EVENT_PAGE_SIZE = 30
const TIMELINE_COLORS = ['#fbbf24', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb7185']

function formatInteger(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function formatDecimal(value: number): string {
  return Math.max(0, value).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function formatKd(kills: number, deaths: number): string {
  return `${formatInteger(kills)} / ${formatInteger(deaths)}`
}

function compareGameNames(a: string, b: string): number {
  const normalizedA = a.toLocaleLowerCase('en-US')
  const normalizedB = b.toLocaleLowerCase('en-US')
  if (normalizedA === normalizedB) return 0
  return normalizedA < normalizedB ? -1 : 1
}

function killboardEventUrl(eventId: string): string {
  return `https://albiononline.com/killboard/kill/${encodeURIComponent(eventId)}`
}

function actorGroupKey(actor: PublicBattleAnalysisActor, level: GroupLevel): string {
  if (level === 'guilds') return actor.guildKey
  if (level === 'alliances') return actor.allianceKey
  return actor.forceKey
}

function actorGroupName(actor: PublicBattleAnalysisActor, level: GroupLevel): string {
  if (level === 'guilds') return actor.guildName
  if (level === 'alliances') return actor.allianceName || actor.guildName
  return actor.forceName
}

function playerStatGroupKey(stat: PublicBattleGroupPlayerBattleLine, level: GroupLevel): string {
  if (level === 'guilds') return stat.guildKey
  if (level === 'alliances') return stat.allianceKey
  return stat.forceKey
}

function playerCurrentGroupKey(player: PublicBattleAnalysisPlayer, level: GroupLevel): string {
  if (level === 'guilds') return player.guildKey
  if (level === 'alliances') return player.allianceKey
  return player.forceKey
}

function groupRows(report: PublicBattleGroupReport, level: GroupLevel): PublicBattleGroupForceLine[] {
  if (level === 'alliances') return report.alliances
  if (level === 'guilds') return report.guilds
  return report.forces
}

function PanelHeader({ icon, title, count }: { icon: ReactNode; title: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3 sm:px-5">
      {icon}
      <h2 className="text-sm font-bold text-white text-balance">{title}</h2>
      {typeof count === 'number' && (
        <span className="ml-auto rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] tabular-nums text-gray-400">
          {formatInteger(count)}
        </span>
      )}
    </div>
  )
}

function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label: string
}) {
  return (
    <label className="relative block min-w-0 flex-1">
      <span className="sr-only">{label}</span>
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-lg border border-white/10 bg-black/20 pl-9 pr-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-amber-400/60 focus:ring-2 focus:ring-amber-400/10"
      />
    </label>
  )
}

function CoverageNotice({ analysis }: { analysis: PublicBattleGroupAnalysis }) {
  const t = useTranslations('publicBattleGroup')
  const { coverage } = analysis
  const complete = coverage.status === 'complete'
  const unavailable = coverage.status === 'unavailable'
  const tone = complete
    ? 'border-emerald-400/20 bg-emerald-400/8 text-emerald-100'
    : unavailable
      ? 'border-red-400/25 bg-red-400/8 text-red-100'
      : 'border-amber-400/25 bg-amber-400/8 text-amber-100'
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`} role={complete ? undefined : 'status'}>
      <div className="flex items-start gap-3">
        {complete ? <Shield size={17} className="mt-0.5 shrink-0" /> : <Zap size={17} className="mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {t(`coverage.${coverage.status}Title`, {
              observed: coverage.observed,
              expected: coverage.expected,
            })}
          </p>
          <p className="mt-1 text-xs leading-relaxed opacity-80">
            {t(`coverage.${coverage.status}Body`)}
          </p>
        </div>
      </div>
    </div>
  )
}

function GearActorCard({ actor, tone }: { actor: PublicBattleAnalysisActor; tone: 'killer' | 'victim' }) {
  const t = useTranslations('publicBattleGroup')
  const localeValue = useLocale()
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE
  const { getLocalizedItemNameWithEnchant } = useItemNameResolver(locale)
  const toneClass = tone === 'killer' ? 'text-emerald-300' : 'text-red-300'
  return (
    <section className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-xs font-bold uppercase tracking-wider ${toneClass}`}>
            {t(`gear.${tone}`)}
          </p>
          <h3 className="mt-1 truncate text-lg font-bold text-white">{actor.playerName}</h3>
          <p className="truncate text-xs text-gray-500">{actor.forceName} · {actor.guildName}</p>
        </div>
        <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 font-mono text-xs tabular-nums text-gray-300">
          {actor.itemPower === null ? t('players.ipUnknown') : t('players.ipValue', { value: Math.round(actor.itemPower) })}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-5 gap-2">
        {PUBLIC_BATTLE_EQUIPMENT_SLOTS.map((slot) => {
          const item = actor.equipment?.[slot] ?? null
          const name = item
            ? getLocalizedItemNameWithEnchant(item.type, locale, item.type)
            : t('gear.empty')
          return (
            <div key={slot} className="min-w-0 text-center">
              <div className="mx-auto w-fit rounded-lg ring-1 ring-white/5">
                <ItemImage
                  itemId={item?.type ?? null}
                  itemName={name}
                  size={48}
                  hoverPreview
                  clickZoom
                />
              </div>
              <p className="mt-1 truncate text-[10px] text-gray-500" title={name ?? undefined}>
                {t(`gearSlots.${slot}`)}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function GearModal({
  event,
  timezone,
  onClose,
}: {
  event: PublicBattleAnalysisEvent
  timezone: string
  onClose: () => void
}) {
  const t = useTranslations('publicBattleGroup')
  const closeRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  useBodyScrollLock(true)
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === 'Escape') {
        onClose()
        return
      }
      if (keyboardEvent.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (keyboardEvent.shiftKey && document.activeElement === first) {
        keyboardEvent.preventDefault()
        last.focus()
      } else if (!keyboardEvent.shiftKey && document.activeElement === last) {
        keyboardEvent.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-5"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-gear-dialog-title"
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-white/10 bg-[#11141c] shadow-2xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-[#11141c]/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="min-w-0">
            <h2 id="battle-gear-dialog-title" className="font-bold text-white">{t('gear.title')}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {formatTime(event.occurredAt, timezone)} · {formatKillbotCompactFame(event.fame)} {t('fame')}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-gray-300 transition-colors hover:bg-white/10 active:scale-95"
            aria-label={t('gear.close')}
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2 sm:p-5">
          <GearActorCard actor={event.killer} tone="killer" />
          <GearActorCard actor={event.victim} tone="victim" />
        </div>
        <div className="px-4 pb-5 sm:px-5">
          <a
            href={killboardEventUrl(event.eventId)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 text-sm font-semibold text-gray-200 transition-colors hover:bg-white/10 active:scale-[.98]"
          >
            {t('kills.openOriginal')} <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
    </div>
  )
}

function Timeline({
  events,
  report,
  group,
  rows,
  timezone,
}: {
  events: PublicBattleAnalysisEvent[]
  report: PublicBattleGroupReport
  group: SelectedGroup
  rows: PublicBattleGroupForceLine[]
  timezone: string
}) {
  const t = useTranslations('publicBattleGroup')
  const chart = useMemo(() => {
    if (events.length === 0) return null
    const times = events.map((event) => Date.parse(event.occurredAt)).filter(Number.isFinite)
    if (times.length === 0) return null
    const minTime = Math.min(...times)
    const maxTime = Math.max(...times)
    const span = Math.max(1, maxTime - minTime)
    const killCounts = new Map<string, number>()
    const names = new Map(rows.map((row) => [row.forceKey, row.forceName]))
    for (const event of events) {
      const key = actorGroupKey(event.killer, group.level)
      killCounts.set(key, (killCounts.get(key) ?? 0) + 1)
      names.set(key, actorGroupName(event.killer, group.level))
    }
    const keys = Array.from(killCounts.keys())
      .sort((a, b) => (killCounts.get(b) ?? 0) - (killCounts.get(a) ?? 0))
      .slice(0, 6)
    if (!keys.includes(group.key)) {
      if (keys.length >= 6) keys.pop()
      keys.unshift(group.key)
    }
    const maxKills = Math.max(1, ...keys.map((key) => killCounts.get(key) ?? 0))
    const width = 920
    const height = 286
    const left = 46
    const right = 18
    const top = 18
    const bottom = 34
    const plotWidth = width - left - right
    const plotHeight = height - top - bottom
    const x = (timestamp: number) => left + ((timestamp - minTime) / span) * plotWidth
    const y = (kills: number) => top + plotHeight - (kills / maxKills) * plotHeight
    const lines = keys.map((key, index) => {
      let count = 0
      let path = `M ${left} ${y(0)}`
      for (const event of events) {
        if (actorGroupKey(event.killer, group.level) !== key) continue
        const eventX = x(Date.parse(event.occurredAt))
        path += ` H ${eventX} V ${y(++count)}`
      }
      path += ` H ${width - right}`
      return {
        key,
        name: names.get(key) ?? key,
        kills: count,
        color: TIMELINE_COLORS[index],
        path,
      }
    })
    const boundaries = report.battles
      .map((battle) => ({
        id: battle.albionBattleId,
        timestamp: Date.parse(battle.startedAt),
      }))
      .filter((boundary) => Number.isFinite(boundary.timestamp) && boundary.timestamp >= minTime && boundary.timestamp <= maxTime)
      .map((boundary) => ({ ...boundary, x: x(boundary.timestamp) }))
    const ticks = Array.from({ length: 5 }, (_, index) => Math.round((maxKills * index) / 4))
    return { width, height, left, right, top, bottom, plotHeight, lines, boundaries, ticks, y, minTime, maxTime }
  }, [events, group, report.battles, rows])

  if (!chart) {
    return <p className="px-4 py-8 text-center text-sm text-gray-500">{t('timeline.empty')}</p>
  }

  return (
    <div className="p-4 sm:p-5">
      <div className="overflow-x-auto rounded-xl border border-white/8 bg-black/20 p-2">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="min-w-[720px] w-full"
          role="img"
          aria-labelledby="battle-timeline-title battle-timeline-desc"
        >
          <title id="battle-timeline-title">{t('timeline.chartTitle')}</title>
          <desc id="battle-timeline-desc">{t('timeline.chartDescription')}</desc>
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={chart.left}
                x2={chart.width - chart.right}
                y1={chart.y(tick)}
                y2={chart.y(tick)}
                stroke="rgba(255,255,255,.08)"
              />
              <text x={chart.left - 8} y={chart.y(tick) + 4} textAnchor="end" fill="#6b7280" fontSize="11">
                {tick}
              </text>
            </g>
          ))}
          {chart.boundaries.map((boundary) => (
            <g key={boundary.id}>
              <line
                x1={boundary.x}
                x2={boundary.x}
                y1={chart.top}
                y2={chart.top + chart.plotHeight}
                stroke="rgba(255,255,255,.16)"
                strokeDasharray="4 5"
              />
              <text x={boundary.x + 4} y={chart.top + 11} fill="#6b7280" fontSize="10">
                #{boundary.id}
              </text>
            </g>
          ))}
          {chart.lines.map((line) => (
            <path
              key={line.key}
              d={line.path}
              fill="none"
              stroke={line.color}
              strokeWidth={line.key === group.key ? 3.5 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={line.key === group.key ? 1 : 0.8}
            />
          ))}
          <text x={chart.left} y={chart.height - 8} fill="#6b7280" fontSize="11">
            {formatTime(new Date(chart.minTime).toISOString(), timezone)}
          </text>
          <text x={chart.width - chart.right} y={chart.height - 8} textAnchor="end" fill="#6b7280" fontSize="11">
            {formatTime(new Date(chart.maxTime).toISOString(), timezone)}
          </text>
        </svg>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
        {chart.lines.map((line) => (
          <div key={line.key} className="flex min-w-0 items-center gap-2 text-xs text-gray-400">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
            <span className="max-w-44 truncate">{line.name}</span>
            <span className="font-mono tabular-nums text-gray-200">{line.kills}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PublicBattleReportExplorer({
  report,
  analysis,
  timezone,
}: {
  report: PublicBattleGroupReport
  analysis: PublicBattleGroupAnalysis
  timezone: string
}) {
  const t = useTranslations('publicBattleGroup')
  const localeValue = useLocale()
  const locale = isLocale(localeValue) ? localeValue : DEFAULT_LOCALE
  const { getLocalizedItemNameWithEnchant } = useItemNameResolver(locale)
  const [battleScope, setBattleScope] = useState<number | 'all'>('all')
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup>({
    level: 'forces',
    key: report.primaryForce.forceKey,
  })
  const [forceSearch, setForceSearch] = useState('')
  const [showAllForces, setShowAllForces] = useState(false)
  const [playerSearch, setPlayerSearch] = useState('')
  const [playerSort, setPlayerSort] = useState<PlayerSort>('kills')
  const [playerPage, setPlayerPage] = useState(1)
  const [eventSearch, setEventSearch] = useState('')
  const [eventPage, setEventPage] = useState(1)
  const [gearEvent, setGearEvent] = useState<PublicBattleAnalysisEvent | null>(null)
  const closeGear = useCallback(() => setGearEvent(null), [])

  const rows = groupRows(report, selectedGroup.level)
  const selectedRow = rows.find((row) => row.forceKey === selectedGroup.key) ?? rows[0]
  const normalizedForceSearch = forceSearch.trim().toLocaleLowerCase(locale)
  const visibleForceRows = rows.filter((row) => {
    if (!normalizedForceSearch) return true
    return [row.forceName, ...row.guildNames].some((name) =>
      name.toLocaleLowerCase(locale).includes(normalizedForceSearch),
    )
  })
  const limitedForceRows = showAllForces ? visibleForceRows : visibleForceRows.slice(0, 12)

  const scopedEvents = useMemo(
    () => analysis.events.filter((event) => battleScope === 'all' || event.battleId === battleScope),
    [analysis.events, battleScope],
  )

  const selectedEvents = useMemo(
    () => scopedEvents.filter((event) =>
      actorGroupKey(event.killer, selectedGroup.level) === selectedGroup.key ||
      actorGroupKey(event.victim, selectedGroup.level) === selectedGroup.key,
    ),
    [scopedEvents, selectedGroup],
  )

  const scopedPlayers = useMemo<ScopedPlayer[]>(() => {
    const query = playerSearch.trim().toLocaleLowerCase(locale)
    const output: ScopedPlayer[] = []
    for (const player of analysis.players) {
      const stats = player.battleStats.filter((stat) =>
        (battleScope === 'all' || stat.battleId === battleScope) &&
        playerStatGroupKey(stat, selectedGroup.level) === selectedGroup.key,
      )
      const fallbackMember = stats.length === 0 &&
        player.battleStats.length === 0 &&
        playerCurrentGroupKey(player, selectedGroup.level) === selectedGroup.key &&
        (battleScope === 'all' || player.battleIds.includes(battleScope))
      if (stats.length === 0 && !fallbackMember) continue
      if (query && ![player.playerName, player.guildName, player.forceName].some((value) => value.toLocaleLowerCase(locale).includes(query))) {
        continue
      }
      const eventStats = player.eventStats.filter((stat) => battleScope === 'all' || stat.battleId === battleScope)
      const observations = player.observations.filter((observation) => battleScope === 'all' || observation.battleId === battleScope)
      const observation = observations.at(-1)
      output.push({
        ...player,
        scopedKills: stats.reduce((sum, stat) => sum + stat.kills, 0),
        scopedDeaths: stats.reduce((sum, stat) => sum + stat.deaths, 0),
        scopedFame: stats.reduce((sum, stat) => sum + stat.killFame, 0),
        scopedDamage: eventStats.reduce((sum, stat) => sum + stat.damage, 0),
        scopedHealing: eventStats.reduce((sum, stat) => sum + stat.healing, 0),
        scopedItemPower: observation?.itemPower ?? null,
        scopedWeaponId: observation?.weaponId ?? null,
        scopedEquipment: observation?.equipment ?? null,
      })
    }
    return output.sort((a, b) => {
      if (playerSort === 'name') return compareGameNames(a.playerName, b.playerName)
      if (playerSort === 'fame') return b.scopedFame - a.scopedFame || b.scopedKills - a.scopedKills
      if (playerSort === 'damage') return b.scopedDamage - a.scopedDamage || b.scopedKills - a.scopedKills
      if (playerSort === 'healing') return b.scopedHealing - a.scopedHealing || b.scopedKills - a.scopedKills
      return b.scopedKills - a.scopedKills || b.scopedFame - a.scopedFame || compareGameNames(a.playerName, b.playerName)
    })
  }, [analysis.players, battleScope, locale, playerSearch, playerSort, selectedGroup])

  const playerPageCount = Math.max(1, Math.ceil(scopedPlayers.length / PLAYER_PAGE_SIZE))
  const playerRows = scopedPlayers.slice((playerPage - 1) * PLAYER_PAGE_SIZE, playerPage * PLAYER_PAGE_SIZE)
  const normalizedEventSearch = eventSearch.trim().toLocaleLowerCase(locale)
  const filteredEvents = selectedEvents.filter((event) => {
    if (!normalizedEventSearch) return true
    return [event.killer.playerName, event.killer.guildName, event.victim.playerName, event.victim.guildName]
      .some((value) => value.toLocaleLowerCase(locale).includes(normalizedEventSearch))
  })
  const eventRows = filteredEvents.slice(0, eventPage * EVENT_PAGE_SIZE)

  const selectedKills = selectedEvents.filter((event) => actorGroupKey(event.killer, selectedGroup.level) === selectedGroup.key)
  const selectedDeaths = selectedEvents.filter((event) => actorGroupKey(event.victim, selectedGroup.level) === selectedGroup.key)

  const breakdown = (mode: 'kills' | 'deaths') => {
    const map = new Map<string, { name: string; count: number }>()
    const source = mode === 'kills' ? selectedKills : selectedDeaths
    for (const event of source) {
      const actor = mode === 'kills' ? event.victim : event.killer
      const key = actorGroupKey(actor, selectedGroup.level)
      const current = map.get(key) ?? { name: actorGroupName(actor, selectedGroup.level), count: 0 }
      current.count += 1
      map.set(key, current)
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 8)
  }
  const killBreakdown = breakdown('kills')
  const deathBreakdown = breakdown('deaths')

  const composition = useMemo(() => {
    const map = new Map<string, { category: string; count: number; weaponId: string | null }>()
    let observedPlayers = 0
    let totalIp = 0
    let ipCount = 0
    for (const player of scopedPlayers) {
      const category = extractWeaponCategory(player.scopedWeaponId) ?? 'UNKNOWN'
      const current = map.get(category) ?? { category, count: 0, weaponId: player.scopedWeaponId }
      current.count += 1
      if (!current.weaponId && player.scopedWeaponId) current.weaponId = player.scopedWeaponId
      map.set(category, current)
      if (player.scopedWeaponId) observedPlayers += 1
      if (player.scopedItemPower !== null) {
        totalIp += player.scopedItemPower
        ipCount += 1
      }
    }
    return {
      rows: Array.from(map.values()).sort((a, b) => b.count - a.count),
      observedPlayers,
      averageIp: ipCount > 0 ? totalIp / ipCount : null,
    }
  }, [scopedPlayers])

  const switchLevel = (level: GroupLevel) => {
    const nextRows = groupRows(report, level)
    const next = nextRows.find((row) => row.highlighted) ?? nextRows[0]
    if (next) setSelectedGroup({ level, key: next.forceKey })
    setForceSearch('')
    setShowAllForces(false)
    setPlayerPage(1)
    setEventPage(1)
  }

  const selectBattleScope = (scope: number | 'all') => {
    setBattleScope(scope)
    setPlayerPage(1)
    setEventPage(1)
  }

  const navItems = [
    ['forces', t('nav.forces')],
    ['players', t('nav.players')],
    ['kills', t('nav.kills')],
    ['composition', t('nav.composition')],
    ['timeline', t('nav.timeline')],
    ['sources', t('nav.sources')],
  ] as const

  return (
    <div className="space-y-5">
      <CoverageNotice analysis={analysis} />

      <nav className="sticky top-2 z-30 overflow-x-auto rounded-xl border border-white/10 bg-[#11141c]/90 p-1.5 shadow-xl backdrop-blur-xl" aria-label={t('nav.ariaLabel')}>
        <div className="flex min-w-max gap-1">
          {navItems.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="min-h-11 rounded-lg px-3 text-xs font-semibold text-gray-400 transition-colors hover:bg-white/5 hover:text-white active:scale-95"
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <section className="rounded-xl border border-white/10 bg-[#11141c]/80 p-4 sm:p-5" aria-labelledby="battle-scope-title">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 id="battle-scope-title" className="text-sm font-bold text-white">{t('scope.title')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('scope.body')}</p>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => selectBattleScope('all')}
              className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-bold transition-colors active:scale-95 ${battleScope === 'all' ? 'border-amber-400/50 bg-amber-400/10 text-amber-200' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}`}
            >
              {t('scope.allBattles', { count: report.battleCount })}
            </button>
            {report.battles.map((battle, index) => (
              <button
                key={battle.albionBattleId}
                type="button"
                onClick={() => selectBattleScope(battle.albionBattleId)}
                className={`min-h-11 shrink-0 rounded-lg border px-3 text-xs font-bold transition-colors active:scale-95 ${battleScope === battle.albionBattleId ? 'border-sky-400/50 bg-sky-400/10 text-sky-200' : 'border-white/10 bg-white/5 text-gray-400 hover:text-white'}`}
              >
                {t('scope.battleLabel', { index: index + 1, id: battle.albionBattleId })}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="forces" className="scroll-mt-24 overflow-hidden rounded-xl border border-white/10 bg-[#11141c]/80">
        <PanelHeader icon={<Users size={16} className="text-amber-300" />} title={t('forces.title')} count={rows.length} />
        <div className="border-b border-white/8 p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/8 bg-black/20 p-1" role="tablist" aria-label={t('forces.levelAria')}>
            {(['forces', 'alliances', 'guilds'] as const).map((level) => (
              <button
                key={level}
                type="button"
                role="tab"
                aria-selected={selectedGroup.level === level}
                onClick={() => switchLevel(level)}
                className={`min-h-11 rounded-md px-2 text-xs font-bold transition-colors active:scale-[.98] ${selectedGroup.level === level ? 'bg-white/10 text-white shadow-sm' : 'text-gray-500 hover:text-gray-200'}`}
              >
                {t(`forces.levels.${level}`)}
              </button>
            ))}
          </div>
          <div className="mt-3">
            <SearchField value={forceSearch} onChange={setForceSearch} placeholder={t('forces.searchPlaceholder')} label={t('forces.searchLabel')} />
          </div>
        </div>
        <div className="divide-y divide-white/6">
          {limitedForceRows.map((row) => {
            const active = row.forceKey === selectedGroup.key
            return (
              <button
                key={row.forceKey}
                type="button"
                onClick={() => {
                  setSelectedGroup({ level: selectedGroup.level, key: row.forceKey })
                  setPlayerPage(1)
                  setEventPage(1)
                }}
                className={`grid min-h-16 w-full grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1.5fr)_90px_120px_100px] sm:px-5 ${active ? 'bg-amber-400/10 shadow-[inset_3px_0_0_#fbbf24]' : 'hover:bg-white/[.035]'}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-bold text-white">{row.forceName}</p>
                    {row.highlighted && (
                      <span className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">{t('highlightedForce')}</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{row.guildNames.join(', ') || t('unknownGuild')}</p>
                </div>
                <div className="text-right sm:text-center">
                  <p className="font-mono text-sm font-bold tabular-nums text-gray-200">{formatInteger(row.players)}</p>
                  <p className="text-[10px] text-gray-600">{t('playersColumn')}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className={`font-mono text-sm font-bold tabular-nums ${row.kills > row.deaths ? 'text-emerald-300' : row.deaths > row.kills ? 'text-red-300' : 'text-amber-200'}`}>{formatKd(row.kills, row.deaths)}</p>
                  <p className="text-[10px] text-gray-600">{t('kdColumn')}</p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="font-mono text-sm tabular-nums text-amber-200">{formatKillbotCompactFame(row.killFame)}</p>
                  <p className="text-[10px] text-gray-600">{t('fameColumn')}</p>
                </div>
              </button>
            )
          })}
          {limitedForceRows.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">{t('forces.empty')}</p>}
        </div>
        {visibleForceRows.length > 12 && (
          <button
            type="button"
            onClick={() => setShowAllForces((value) => !value)}
            className="flex min-h-11 w-full items-center justify-center gap-2 border-t border-white/8 text-xs font-bold text-gray-400 transition-colors hover:bg-white/[.035] hover:text-white active:scale-[.99]"
          >
            {showAllForces ? t('common.showLess') : t('common.showAll', { count: visibleForceRows.length })}
            <ChevronDown size={14} className={showAllForces ? 'rotate-180' : ''} />
          </button>
        )}
      </section>

      <section id="players" className="scroll-mt-24 overflow-hidden rounded-xl border border-white/10 bg-[#11141c]/80">
        <PanelHeader icon={<Crosshair size={16} className="text-sky-300" />} title={t('players.title', { name: selectedRow?.forceName ?? '-' })} count={scopedPlayers.length} />
        <div className="flex flex-col gap-2 border-b border-white/8 p-4 sm:flex-row sm:p-5">
          <SearchField value={playerSearch} onChange={(value) => { setPlayerSearch(value); setPlayerPage(1) }} placeholder={t('players.searchPlaceholder')} label={t('players.searchLabel')} />
          <label className="shrink-0">
            <span className="sr-only">{t('players.sortLabel')}</span>
            <select
              value={playerSort}
              onChange={(event) => { setPlayerSort(event.target.value as PlayerSort); setPlayerPage(1) }}
              className="h-11 w-full rounded-lg border border-white/10 bg-[#11141c] px-3 text-sm text-gray-300 outline-none focus:border-amber-400/60 sm:w-44"
            >
              {(['kills', 'fame', 'damage', 'healing', 'name'] as const).map((sort) => <option key={sort} value={sort}>{t(`players.sort.${sort}`)}</option>)}
            </select>
          </label>
        </div>
        <div className="divide-y divide-white/6 md:hidden">
          {playerRows.map((player) => {
            const weaponName = player.scopedWeaponId
              ? getLocalizedItemNameWithEnchant(player.scopedWeaponId, locale, player.scopedWeaponId)
              : t('players.weaponUnknown')
            return (
              <article key={player.playerId} className="p-4">
                <div className="flex gap-3">
                  <ItemImage itemId={player.scopedWeaponId} itemName={weaponName} size={44} hoverPreview clickZoom />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{player.playerName}</p>
                    <p className="truncate text-xs text-gray-500">{player.guildName}</p>
                    <p className="mt-1 truncate text-xs text-gray-400">{weaponName}</p>
                  </div>
                  <span className="font-mono text-xs tabular-nums text-gray-500">{player.scopedItemPower === null ? '-' : Math.round(player.scopedItemPower)}</span>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-black/20 px-2 py-2"><dt className="text-[10px] text-gray-600">{t('kdColumn')}</dt><dd className="mt-1 font-mono text-xs font-bold tabular-nums text-gray-200">{formatKd(player.scopedKills, player.scopedDeaths)}</dd></div>
                  <div className="rounded-lg bg-black/20 px-2 py-2"><dt className="text-[10px] text-gray-600">{t('players.damage')}</dt><dd className="mt-1 font-mono text-xs tabular-nums text-orange-200">{formatDecimal(player.scopedDamage)}</dd></div>
                  <div className="rounded-lg bg-black/20 px-2 py-2"><dt className="text-[10px] text-gray-600">{t('players.healing')}</dt><dd className="mt-1 font-mono text-xs tabular-nums text-emerald-200">{formatDecimal(player.scopedHealing)}</dd></div>
                </dl>
              </article>
            )
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-black/20 text-[11px] uppercase tracking-wide text-gray-600">
              <tr><th className="px-5 py-2.5 text-left">{t('players.player')}</th><th className="px-4 py-2.5 text-left">{t('players.weapon')}</th><th className="px-4 py-2.5 text-right">{t('players.ip')}</th><th className="px-4 py-2.5 text-right">{t('kdColumn')}</th><th className="px-4 py-2.5 text-right">{t('fameColumn')}</th><th className="px-4 py-2.5 text-right">{t('players.damage')}</th><th className="px-5 py-2.5 text-right">{t('players.healing')}</th></tr>
            </thead>
            <tbody className="divide-y divide-white/6">
              {playerRows.map((player) => {
                const weaponName = player.scopedWeaponId
                  ? getLocalizedItemNameWithEnchant(player.scopedWeaponId, locale, player.scopedWeaponId)
                  : t('players.weaponUnknown')
                return (
                  <tr key={player.playerId} className="hover:bg-white/[.025]">
                    <td className="px-5 py-2.5"><p className="font-semibold text-gray-100">{player.playerName}</p><p className="text-xs text-gray-600">{player.guildName}</p></td>
                    <td className="px-4 py-2.5"><div className="flex items-center gap-2"><ItemImage itemId={player.scopedWeaponId} itemName={weaponName} size={34} hoverPreview clickZoom /><span className="max-w-44 truncate text-xs text-gray-400">{weaponName}</span></div></td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-gray-400">{player.scopedItemPower === null ? '-' : Math.round(player.scopedItemPower)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-gray-200">{formatKd(player.scopedKills, player.scopedDeaths)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-200">{formatKillbotCompactFame(player.scopedFame)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-orange-200">{formatDecimal(player.scopedDamage)}</td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums text-emerald-200">{formatDecimal(player.scopedHealing)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {playerRows.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">{t('players.empty')}</p>}
        {playerPageCount > 1 && (
          <div className="flex items-center justify-between border-t border-white/8 px-4 py-3 text-xs text-gray-500 sm:px-5">
            <button type="button" disabled={playerPage <= 1} onClick={() => setPlayerPage((page) => Math.max(1, page - 1))} className="min-h-11 rounded-lg border border-white/10 px-3 font-bold disabled:opacity-30 active:scale-95">{t('common.previous')}</button>
            <span className="font-mono tabular-nums">{t('common.page', { current: playerPage, total: playerPageCount })}</span>
            <button type="button" disabled={playerPage >= playerPageCount} onClick={() => setPlayerPage((page) => Math.min(playerPageCount, page + 1))} className="min-h-11 rounded-lg border border-white/10 px-3 font-bold disabled:opacity-30 active:scale-95">{t('common.next')}</button>
          </div>
        )}
      </section>

      <section id="kills" className="scroll-mt-24 overflow-hidden rounded-xl border border-white/10 bg-[#11141c]/80">
        <PanelHeader icon={<Skull size={16} className="text-red-300" />} title={t('kills.title', { name: selectedRow?.forceName ?? '-' })} count={selectedEvents.length} />
        <div className="grid gap-px border-b border-white/8 bg-white/8 sm:grid-cols-2">
          <div className="bg-[#11141c] p-4 sm:p-5"><p className="text-xs font-bold text-emerald-300">{t('kills.kills', { count: selectedKills.length })}</p><div className="mt-3 space-y-2">{killBreakdown.map((row) => <div key={row.name} className="flex items-center gap-3 text-xs"><span className="min-w-0 flex-1 truncate text-gray-400">{row.name}</span><div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.max(5, row.count / Math.max(1, killBreakdown[0]?.count ?? 1) * 100)}%` }} /></div><span className="w-6 text-right font-mono tabular-nums text-gray-200">{row.count}</span></div>)}</div></div>
          <div className="bg-[#11141c] p-4 sm:p-5"><p className="text-xs font-bold text-red-300">{t('kills.deaths', { count: selectedDeaths.length })}</p><div className="mt-3 space-y-2">{deathBreakdown.map((row) => <div key={row.name} className="flex items-center gap-3 text-xs"><span className="min-w-0 flex-1 truncate text-gray-400">{row.name}</span><div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-red-400" style={{ width: `${Math.max(5, row.count / Math.max(1, deathBreakdown[0]?.count ?? 1) * 100)}%` }} /></div><span className="w-6 text-right font-mono tabular-nums text-gray-200">{row.count}</span></div>)}</div></div>
        </div>
        <div className="border-b border-white/8 p-4 sm:p-5"><SearchField value={eventSearch} onChange={(value) => { setEventSearch(value); setEventPage(1) }} placeholder={t('kills.searchPlaceholder')} label={t('kills.searchLabel')} /></div>
        <div className="divide-y divide-white/6">
          {eventRows.map((event) => {
            const isKill = actorGroupKey(event.killer, selectedGroup.level) === selectedGroup.key
            return (
              <button key={`${event.battleId}:${event.eventId}`} type="button" onClick={() => setGearEvent(event)} className="grid min-h-16 w-full grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[.035] active:scale-[.997] sm:px-5">
                <span className={`flex size-9 items-center justify-center rounded-lg border text-xs font-black ${isKill ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-red-400/25 bg-red-400/10 text-red-300'}`}>{isKill ? 'K' : 'D'}</span>
                <div className="min-w-0"><p className="truncate text-sm text-gray-200"><span className="font-bold text-white">{event.killer.playerName}</span><span className="mx-2 text-gray-600">→</span><span className="font-bold text-white">{event.victim.playerName}</span></p><p className="mt-1 truncate text-xs text-gray-600">{event.killer.guildName} → {event.victim.guildName}</p></div>
                <div className="text-right"><p className="font-mono text-xs tabular-nums text-amber-200">{formatKillbotCompactFame(event.fame)}</p><p className="mt-1 text-[10px] text-gray-600">#{event.battleId} · {formatTime(event.occurredAt, timezone)}</p></div>
              </button>
            )
          })}
          {eventRows.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">{analysis.coverage.status === 'unavailable' ? t('kills.unavailable') : t('kills.empty')}</p>}
        </div>
        {eventRows.length < filteredEvents.length && <button type="button" onClick={() => setEventPage((page) => page + 1)} className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-white/8 text-xs font-bold text-gray-400 hover:bg-white/[.035] hover:text-white active:scale-[.99]">{t('common.showMore', { remaining: filteredEvents.length - eventRows.length })}<ChevronDown size={14} /></button>}
      </section>

      <section id="composition" className="scroll-mt-24 overflow-hidden rounded-xl border border-white/10 bg-[#11141c]/80">
        <PanelHeader icon={<Layers3 size={16} className="text-violet-300" />} title={t('composition.title', { name: selectedRow?.forceName ?? '-' })} count={composition.observedPlayers} />
        <div className="grid gap-px border-b border-white/8 bg-white/8 sm:grid-cols-2">
          <div className="bg-[#11141c] p-4 sm:p-5"><p className="text-[11px] uppercase tracking-wide text-gray-600">{t('composition.observed')}</p><p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">{formatInteger(composition.observedPlayers)}<span className="ml-1 text-sm font-normal text-gray-500">/ {formatInteger(scopedPlayers.length)}</span></p></div>
          <div className="bg-[#11141c] p-4 sm:p-5"><p className="text-[11px] uppercase tracking-wide text-gray-600">{t('composition.averageIp')}</p><p className="mt-1 font-mono text-2xl font-bold tabular-nums text-white">{composition.averageIp === null ? '-' : Math.round(composition.averageIp)}</p></div>
        </div>
        <div className="divide-y divide-white/6">
          {composition.rows.map((row) => {
            const weaponName = row.weaponId
              ? getLocalizedItemNameWithEnchant(row.weaponId, locale, row.category)
              : t('players.weaponUnknown')
            return <div key={row.category} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 sm:px-5"><ItemImage itemId={row.weaponId} itemName={weaponName} size={38} hoverPreview clickZoom /><div className="min-w-0"><div className="flex items-baseline justify-between gap-3"><p className="truncate text-sm font-semibold text-gray-200">{weaponName}</p><span className="font-mono text-xs tabular-nums text-gray-300">{row.count}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5"><div className="h-full rounded-full bg-violet-400" style={{ width: `${row.count / Math.max(1, composition.rows[0]?.count ?? 1) * 100}%` }} /></div></div><span className="hidden rounded bg-white/5 px-2 py-1 font-mono text-[10px] text-gray-500 sm:block">{row.category}</span></div>
          })}
          {composition.rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-gray-500">{t('composition.empty')}</p>}
        </div>
        <p className="border-t border-white/8 px-4 py-3 text-xs leading-relaxed text-gray-600 sm:px-5">{t('composition.note')}</p>
      </section>

      <section id="timeline" className="scroll-mt-24 overflow-hidden rounded-xl border border-white/10 bg-[#11141c]/80">
        <PanelHeader icon={<TrendingUp size={16} className="text-emerald-300" />} title={t('timeline.title')} count={scopedEvents.length} />
        <Timeline events={scopedEvents} report={report} group={selectedGroup} rows={rows} timezone={timezone} />
        <p className="border-t border-white/8 px-4 py-3 text-xs leading-relaxed text-gray-600 sm:px-5">{t('timeline.note')}</p>
      </section>

      <section id="sources" className="scroll-mt-24 overflow-hidden rounded-xl border border-white/10 bg-[#11141c]/80">
        <PanelHeader icon={<Swords size={16} className="text-amber-300" />} title={t('sources.title')} count={report.battles.length} />
        <div className="divide-y divide-white/6">
          {report.battles.map((battle) => {
            const coverage = analysis.coverage.battles.find((item) => item.battleId === battle.albionBattleId)
            return <article key={battle.albionBattleId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:px-5"><div className="min-w-0"><p className="font-mono text-sm font-bold text-amber-200">#{battle.albionBattleId}</p><p className="mt-1 truncate text-xs text-gray-500"><Clock size={11} className="mr-1 inline" />{formatDateTime(battle.startedAt, timezone)} · {battle.clusterName ?? t('unknownCluster')}</p></div><div><p className="font-mono text-sm tabular-nums text-gray-200">{battle.totalPlayers}</p><p className="text-[10px] text-gray-600">{t('playersColumn')}</p></div><div><p className="font-mono text-sm tabular-nums text-gray-200">{battle.totalKills}</p><p className="text-[10px] text-gray-600">{t('killsColumn')}</p></div><div className="sm:text-right"><p className={`text-xs font-bold ${coverage?.status === 'complete' ? 'text-emerald-300' : coverage?.status === 'partial' ? 'text-amber-300' : 'text-red-300'}`}>{coverage ? t(`coverage.short.${coverage.status}`) : '-'}</p><p className="mt-1 font-mono text-[10px] tabular-nums text-gray-600">{coverage?.observed ?? 0}/{coverage?.expected ?? battle.totalKills}</p></div></article>
          })}
        </div>
      </section>

      {gearEvent && <GearModal event={gearEvent} timezone={timezone} onClose={closeGear} />}
    </div>
  )
}
