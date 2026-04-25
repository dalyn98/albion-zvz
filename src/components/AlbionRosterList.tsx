'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Globe, Link2, Link2Off, ShieldOff, Swords } from 'lucide-react'
import { useTranslations } from 'next-intl'
import SearchBox from './SearchBox'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import { ALBION_SERVER_LABEL } from '@/lib/albion-gameinfo'
import type { AlbionRosterEntry } from '@/app/actions/members-admin'

interface Props {
  roster: AlbionRosterEntry[]
}

type SortKey = 'kill_fame' | 'fame_ratio' | 'average_ip' | 'name'
type LinkFilter = 'all' | 'linked' | 'unlinked'

export default function AlbionRosterList({ roster }: Props) {
  const t = useTranslations('members')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('kill_fame')
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    let base = roster
    if (q) base = base.filter((r) => matchesName(r.albion_player_name, q))
    if (linkFilter === 'linked') {
      base = base.filter((r) => r.linked_discord_id !== null && !r.linked_withdrawn)
    } else if (linkFilter === 'unlinked') {
      base = base.filter((r) => r.linked_discord_id === null || r.linked_withdrawn)
    }
    const sorted = [...base]
    if (sortKey === 'kill_fame') {
      sorted.sort((a, b) => b.kill_fame - a.kill_fame)
    } else if (sortKey === 'fame_ratio') {
      sorted.sort((a, b) => b.fame_ratio - a.fame_ratio)
    } else if (sortKey === 'average_ip') {
      sorted.sort((a, b) => b.average_item_power - a.average_item_power)
    } else {
      sorted.sort((a, b) => a.albion_player_name.localeCompare(b.albion_player_name))
    }
    return sorted
  }, [roster, search, sortKey, linkFilter])

  const linkedCount = useMemo(
    () => roster.filter((r) => r.linked_discord_id !== null && !r.linked_withdrawn).length,
    [roster],
  )

  if (roster.length === 0) {
    return <p className="text-gray-500 text-sm text-center py-8">{t('rosterEmpty')}</p>
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
        <Globe size={18} className="text-emerald-400" />
        <div className="text-xs text-gray-400">
          {t.rich('rosterCounter', {
            total: roster.length,
            linked: linkedCount,
            bold: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
          })}
        </div>
      </div>

      <SearchBox
        value={search}
        onChange={setSearch}
        placeholder={t('rosterSearchPlaceholder')}
      />

      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip active={linkFilter === 'all'} onClick={() => setLinkFilter('all')}>
          {t('rosterFilterAll')} ({roster.length})
        </FilterChip>
        <FilterChip active={linkFilter === 'linked'} onClick={() => setLinkFilter('linked')}>
          {t('rosterFilterLinked')} ({linkedCount})
        </FilterChip>
        <FilterChip
          active={linkFilter === 'unlinked'}
          onClick={() => setLinkFilter('unlinked')}
        >
          {t('rosterFilterUnlinked')} ({roster.length - linkedCount})
        </FilterChip>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <SortChip active={sortKey === 'kill_fame'} onClick={() => setSortKey('kill_fame')}>
          {t('rosterSortKillFame')}
        </SortChip>
        <SortChip active={sortKey === 'fame_ratio'} onClick={() => setSortKey('fame_ratio')}>
          {t('rosterSortFameRatio')}
        </SortChip>
        <SortChip active={sortKey === 'average_ip'} onClick={() => setSortKey('average_ip')}>
          {t('rosterSortIp')}
        </SortChip>
        <SortChip active={sortKey === 'name'} onClick={() => setSortKey('name')}>
          {t('rosterSortName')}
        </SortChip>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('noSearchResult')}</p>
      ) : (
        <ul className="space-y-2 xl:grid xl:grid-cols-2 xl:gap-2 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((entry) => (
            <RosterRow key={entry.albion_player_id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  )
}

function RosterRow({ entry }: { entry: AlbionRosterEntry }) {
  const t = useTranslations('members')
  const isLinked = entry.linked_discord_id !== null && !entry.linked_withdrawn
  const isWithdrawn = entry.linked_discord_id !== null && entry.linked_withdrawn

  // 연동된 활성 멤버는 기존 멤버 상세 (Discord 기반) 로 이동. 미연동/탈퇴자는
  // 클릭해도 갈 곳이 없으므로 div 로 렌더한다.
  // Albion gameinfo 는 avatar 필드에 내부 코드만 주는데 공식 CDN 경로가 없어
  // 일반 검 아이콘으로 대신한다 — 멤버 식별은 이름/배지로 충분.
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0">
        <Swords size={18} className="text-gray-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-white text-sm font-semibold flex items-center gap-1.5 min-w-0">
          <span className="truncate min-w-0">{entry.albion_player_name}</span>
          {isLinked ? (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex-shrink-0"
              title={t('rosterDiscordLinkedHint', {
                username: entry.linked_username ?? '',
              })}
            >
              <Link2 size={10} />
              {t('rosterDiscordLinked')}
            </span>
          ) : isWithdrawn ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 flex-shrink-0">
              <ShieldOff size={10} />
              {t('rosterDiscordWithdrawn')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700/60 text-gray-300 flex-shrink-0">
              <Link2Off size={10} />
              {t('rosterDiscordUnlinked')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] text-gray-400">
          <span>{ALBION_SERVER_LABEL[entry.albion_server]}</span>
          <span className="text-gray-600">·</span>
          <span>
            {t('rosterIp')}{' '}
            <span className="text-gray-200 font-mono">{Math.round(entry.average_item_power)}</span>
          </span>
          <span className="text-gray-600">·</span>
          <span>
            {t('rosterFameRatioShort')}{' '}
            <span className="text-gray-200 font-mono">{entry.fame_ratio.toFixed(1)}</span>
          </span>
        </div>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-amber-400 font-mono font-semibold text-sm">
          {Math.round(entry.kill_fame / 1000)}K
        </p>
        <p className="text-gray-500 text-[10px]">{t('rosterKillFame')}</p>
      </div>
      {isLinked && <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />}
    </div>
  )

  if (isLinked && entry.linked_discord_id) {
    return (
      <li>
        <Link
          href={`/members/${entry.linked_discord_id}`}
          className="block bg-gray-900 border border-gray-800 hover:border-amber-500/40 rounded-lg transition-colors"
        >
          {inner}
        </Link>
      </li>
    )
  }

  return (
    <li>
      <div className="bg-gray-900/60 border border-gray-800 rounded-lg">{inner}</div>
    </li>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
          : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
      }`}
    >
      {children}
    </button>
  )
}

function SortChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
        active
          ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
          : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}
