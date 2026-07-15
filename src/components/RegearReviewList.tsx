'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { type AdminRegearRequest } from '@/app/actions/regear-admin'
import type { RegearAnomalyFlag } from '@/lib/regear-anomaly'
import type { StockCheckResult } from '@/lib/inventory'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import {
  clusterRowsByMember,
  type EventGroupRow,
} from '@/lib/regear-review-grouping'
import { compareIsoStringsDesc } from '@/lib/sort-strings'
import EventGroup from './RegearReviewEventGroup'
import RegearReviewRow from './RegearReviewRow'
import SearchBox from './SearchBox'

interface RegearReviewListProps {
  requests: AdminRegearRequest[]
  avatars?: Record<string, string | null>
  // Current payout rate (1..100). Approve button and pending-row hint use this
  // so admins see the exact silver amount the RPC will credit.
  ratePercent: number
  timezone: string
  // When true, 이벤트별로 묶어서 아코디언 UI 로 보여준다. `전체` 스코프에서만 켠다.
  groupByEvent?: boolean
  // 자동 리기어 탭에서 켠다. true 면 각 이벤트 그룹 내부를 멤버별로 클러스터 정렬해서
  // 한 사람이 여러 번 죽었을 때 카드들이 흩어지지 않고 모여 보이도록 한다.
  sortRowsByMember?: boolean
  // pending 요청 id → 이상치 플래그들. 관리자가 승인 전에 한 번 더 확인하도록.
  anomalies?: Record<string, RegearAnomalyFlag[]>
  // pending+crafted 리기어 id → 길드 재고 가용성. 마이그 111 이후 추가.
  // 키가 없거나 result.itemIdsForRpc 가 비면 "재고로 지급" 버튼은 안 보인다.
  stockChecks?: Record<string, StockCheckResult>
  stockChecksWithCape?: Record<string, StockCheckResult>
  uxRefreshEnabled?: boolean
}

export default function RegearReviewList({
  requests,
  avatars = {},
  ratePercent,
  timezone,
  groupByEvent = false,
  sortRowsByMember = false,
  anomalies = {},
  stockChecks = {},
  stockChecksWithCape = {},
  uxRefreshEnabled = false,
}: RegearReviewListProps) {
  const t = useTranslations('adminRegearReview')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return requests
    return requests.filter(
      (r) =>
        matchesName(r.username, q) ||
        matchesDate(r.created_at, q) ||
        matchesDate(r.resolved_at, q),
    )
  }, [requests, search])

  // 이벤트 정렬: 그룹 내 최신 신청(= rows[0], DB 쿼리가 created_at desc) 기준 desc.
  // 삭제된 이벤트는 event_title 기준으로 한 버킷에 묶임.
  // 마이그 097: regear_window 기반 신청은 윈도우 id 기준으로 별도 버킷이 된다.
  // sortRowsByMember=true (자동 리기어 탭) 면 각 그룹 내부를 멤버별로 묶어 정렬한다 —
  // 한 사람이 한 이벤트에서 여러 번 죽었을 때 카드들이 흩어지지 않게.
  const eventGroups = useMemo<EventGroupRow[] | null>(() => {
    if (!groupByEvent) return null
    const map = new Map<string, EventGroupRow>()
    for (const r of filtered) {
      const key = r.event_id || r.regear_window_id || '__no_event__'
      const prev = map.get(key)
      if (prev) {
        prev.rows.push(r)
      } else {
        map.set(key, { groupKey: key, eventId: r.event_id, eventTitle: r.event_title, rows: [r] })
      }
    }
    if (sortRowsByMember) {
      for (const g of map.values()) g.rows = clusterRowsByMember(g.rows)
    }
    return [...map.values()].sort((a, b) =>
      compareIsoStringsDesc(a.rows[0].created_at, b.rows[0].created_at),
    )
  }, [filtered, groupByEvent, sortRowsByMember])

  const searchActive = normalizeQuery(search).length > 0

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{tCommon('searchNoResults')}</p>
      ) : eventGroups ? (
        <ul className="space-y-2">
          {eventGroups.map((g) => (
            <EventGroup
              key={g.groupKey}
              group={g}
              avatars={avatars}
              ratePercent={ratePercent}
              timezone={timezone}
              forceExpanded={searchActive}
              anomalies={anomalies}
              stockChecks={stockChecks}
              stockChecksWithCape={stockChecksWithCape}
              uxRefreshEnabled={uxRefreshEnabled}
            />
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {filtered.map((r) => (
            <RegearReviewRow
              key={r.id}
              request={r}
              avatar={avatars[r.discord_id] ?? null}
              ratePercent={ratePercent}
              timezone={timezone}
              anomalyFlags={anomalies[r.id]}
              stockCheck={stockChecks[r.id]}
              stockCheckWithCape={stockChecksWithCape[r.id]}
              uxRefreshEnabled={uxRefreshEnabled}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
