import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { DEMO_EVENTS } from '@/data/demo-seed'
import { formatTimeLabel } from '../_lib/format'
import { EventStatusPill } from '../_components/Pills'

export default async function DemoEventsPage() {
  const t = await getTranslations('demo')

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('events.title')}</h1>
        <p className="text-xs sm:text-sm text-gray-500">{t('events.subtitle')}</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-950 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">{t('events.listColName')}</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">{t('events.listColTime')}</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">{t('events.listColTemplate')}</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">{t('events.listColZone')}</th>
                <th className="text-right px-3 py-2">{t('events.listColFilled')}</th>
                <th className="text-right px-3 py-2 pr-4">{t('events.listColStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {DEMO_EVENTS.map((evt) => {
                const linkable = evt.id === 'evt-1'
                const cells = (
                  <>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-white">{evt.name}</div>
                      <div className="text-[10px] text-gray-500 sm:hidden mt-0.5">
                        {formatTimeLabel(t, evt.scheduledAt)} · {evt.zone}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-gray-300 whitespace-nowrap">
                      {formatTimeLabel(t, evt.scheduledAt)}
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-gray-400">
                      {evt.templateLabel}
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell text-gray-400">{evt.zone}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-400 whitespace-nowrap">
                      {t('events.filledFraction', { filled: evt.filledCount, total: evt.totalCount })}
                    </td>
                    <td className="px-3 py-2.5 pr-4 text-right">
                      <EventStatusPill status={evt.status} t={t} />
                    </td>
                  </>
                )

                if (!linkable) {
                  return (
                    <tr key={evt.id} className="text-gray-300">
                      {cells}
                    </tr>
                  )
                }
                return (
                  <tr
                    key={evt.id}
                    className="text-gray-200 hover:bg-gray-800/40 transition-colors cursor-pointer"
                  >
                    <td colSpan={6} className="p-0">
                      <Link href={`/demo/events/${evt.id}`} className="block">
                        <table className="w-full text-xs">
                          <tbody>
                            <tr>{cells}</tr>
                          </tbody>
                        </table>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-gray-600 italic px-1">{t('events.demoOnlyDetail')}</p>
    </div>
  )
}
