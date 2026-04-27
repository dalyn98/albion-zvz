import { Skull, Swords } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { listMyTrackedAdHocDeaths } from '@/app/actions/regear-tracked-deaths'
import { listRegearRoleOptions } from '@/app/actions/regear-windows'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { formatDateTimeShort } from '@/lib/format-datetime'
import AdHocDeathSubmitButton from './AdHocDeathSubmitButton'
import AdHocDeathBuildStrip from './AdHocDeathBuildStrip'

// /regear 페이지에서 이벤트 외 트래킹 사망(예외 흐름) 을 카드 리스트로 노출.
// 길드 정모 이벤트가 안 만들어진 일반 트래킹 전투에서 죽은 멤버가 본인 사망
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

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Skull size={16} className="text-rose-400" />
        <h2 className="text-base font-bold text-white">{t('sectionTitle')}</h2>
        <span className="text-xs text-gray-500">({deaths.length})</span>
      </div>
      <p className="text-xs text-gray-500">{t('sectionHint')}</p>
      <ul className="space-y-3">
        {deaths.map((d) => {
          const dt = formatDateTimeShort(d.occurredAt, tz).replace('-', '/')
          const opponentLabel =
            d.opponentName || d.opponentGuild || t('opponentUnknown')
          return (
            <li
              key={d.killboardEventId}
              className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px] font-semibold px-2 py-0.5 rounded-full">
                      <Swords size={11} />
                      {dt}
                    </span>
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
