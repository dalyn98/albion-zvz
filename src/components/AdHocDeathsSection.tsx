import { Skull, Swords } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  listMyTrackedAdHocDeaths,
  type TrackedDeath,
} from '@/app/actions/regear-tracked-deaths'
import { listRegearRoleOptions } from '@/app/actions/regear-windows'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { formatDateTimeShort } from '@/lib/format-datetime'
import AdHocDeathSubmitButton from './AdHocDeathSubmitButton'
import AdHocDeathBuildStrip from './AdHocDeathBuildStrip'

// 같은 battle_id 의 사망을 인접하게 묶고, 같은 그룹 안의 occurred_at desc 정렬.
// battle_id 가 NULL 인 행은 각자 단독 그룹. 그룹 외부 정렬은 deaths 안의 첫 등장
// (= 서버에서 보내준 occurred_at desc) 순서를 그대로 따름.
function groupDeathsByBattle(
  deaths: ReadonlyArray<TrackedDeath>,
): Array<TrackedDeath & { sameBattleIndex: number | null; sameBattleTotal: number }> {
  const groups = new Map<string, TrackedDeath[]>()
  const order: string[] = []
  for (const d of deaths) {
    const key = d.battleId != null ? `b:${d.battleId}` : `kb:${d.killboardEventId}`
    const list = groups.get(key)
    if (list) {
      list.push(d)
    } else {
      groups.set(key, [d])
      order.push(key)
    }
  }
  const sorted: Array<
    TrackedDeath & { sameBattleIndex: number | null; sameBattleTotal: number }
  > = []
  for (const key of order) {
    const list = groups.get(key)!
    list.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    const total = list.length
    list.forEach((d, idx) => {
      sorted.push({
        ...d,
        sameBattleIndex: total >= 2 ? idx + 1 : null,
        sameBattleTotal: total,
      })
    })
  }
  return sorted
}

// /regear 페이지에서 이벤트 외 트래킹 사망(예외 흐름) 을 카드 리스트로 노출.
// 이벤트가 만들어지지 않은 일반 트래킹 전투에서 죽은 멤버가 본인 사망
// 기록을 보고 직접 신청한다. 자동 리기어 cron 은 이벤트 종료 트리거라 이
// 흐름은 자동 처리에 닿지 않은 사망에 대한 안전 그물.
export default async function AdHocDeathsSection() {
  const session = await getSession()
  if (!session?.isMember) return null

  const guildId = await getSessionGuildId(session)
  const [{ deaths, error }, { options }, t, tz] = await Promise.all([
    listMyTrackedAdHocDeaths(),
    listRegearRoleOptions(),
    getTranslations('regearTrackedDeaths'),
    getTenantTimezone(guildId),
  ])

  if (error) {
    return (
      <section className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
        <p className="text-red-300 text-sm">{error}</p>
      </section>
    )
  }
  if (deaths.length === 0) return null

  const grouped = groupDeathsByBattle(deaths)

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Skull size={16} className="text-rose-400" />
        <h2 className="text-base font-bold text-white">{t('sectionTitle')}</h2>
        <span className="text-xs text-gray-500">({deaths.length})</span>
      </div>
      <p className="text-xs text-gray-500">{t('sectionHint')}</p>
      <ul className="space-y-3">
        {grouped.map((d) => {
          const dt = formatDateTimeShort(d.occurredAt, tz).replace('-', '/')
          const opponentLabel =
            d.opponentName || d.opponentGuild || t('opponentUnknown')
          const isGrouped = d.sameBattleIndex != null
          return (
            <li
              key={d.killboardEventId}
              className={`bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3${
                isGrouped ? ' border-l-4 border-l-rose-500' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                      <Swords size={11} />
                      {dt}
                    </span>
                    {isGrouped && (
                      <span className="inline-flex items-center bg-rose-500/10 border border-rose-500/30 text-rose-200 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        {t('sameBattleLabel', {
                          index: d.sameBattleIndex!,
                          total: d.sameBattleTotal,
                        })}
                      </span>
                    )}
                    {d.itemPower != null && (
                      <span className="text-[11px] text-gray-400">
                        IP {d.itemPower.toLocaleString()}
                      </span>
                    )}
                    {d.fame > 0 && (
                      <span className="text-[11px] text-amber-300/80">
                        Fame {d.fame.toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-200 truncate">
                    <span className="text-gray-500">{t('opponentLabel')} </span>
                    <span className="font-semibold">{opponentLabel}</span>
                    {d.opponentName && d.opponentGuild && (
                      <span className="text-gray-500 ml-1">[{d.opponentGuild}]</span>
                    )}
                  </p>
                </div>
                <AdHocDeathSubmitButton
                  killboardEventId={d.killboardEventId}
                  buildSnapshot={d.buildSnapshot}
                  roleOptions={options}
                  battleAtLabel={dt}
                  opponentLabel={opponentLabel}
                />
              </div>
              <AdHocDeathBuildStrip snapshot={d.buildSnapshot} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}
