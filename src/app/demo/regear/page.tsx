import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { DEMO_REGEAR_LIST } from '@/data/demo-seed'
import { formatTimeLabel, formatSilver } from '../_lib/format'
import { RegearStatusPill, RegearOriginPill } from '../_components/Pills'

export default async function DemoRegearPage() {
  const t = await getTranslations('demo')

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('regear.title')}</h1>
        <p className="text-xs sm:text-sm text-gray-500">{t('regear.subtitle')}</p>
      </header>

      <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-950 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-3 py-2">{t('regear.listColVictim')}</th>
                <th className="text-left px-3 py-2 hidden md:table-cell">{t('regear.listColBattle')}</th>
                <th className="text-left px-3 py-2 hidden sm:table-cell">{t('regear.listColTime')}</th>
                <th className="text-left px-3 py-2 hidden lg:table-cell">{t('regear.listColKiller')}</th>
                <th className="text-right px-3 py-2">{t('regear.listColTotal')}</th>
                <th className="text-right px-3 py-2">{t('regear.listColOrigin')}</th>
                <th className="text-right px-3 py-2 pr-4">{t('regear.listColStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {DEMO_REGEAR_LIST.map((rg) => {
                const linkable = rg.id === 'rg-1'
                const cells = (
                  <>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-white">{rg.victim}</div>
                      <div className="text-[10px] text-gray-500 sm:hidden mt-0.5">
                        {formatTimeLabel(t, rg.diedAt)} · {rg.killerName}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell text-gray-400">
                      {rg.battleLabel}
                    </td>
                    <td className="px-3 py-2.5 hidden sm:table-cell text-gray-300 whitespace-nowrap">
                      {formatTimeLabel(t, rg.diedAt)}
                    </td>
                    <td className="px-3 py-2.5 hidden lg:table-cell text-gray-400">
                      {rg.killerName}
                      <span className="text-gray-600"> · {rg.killerWeapon}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-400 whitespace-nowrap">
                      {formatSilver(rg.totalSilver)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <RegearOriginPill origin={rg.origin} t={t} />
                    </td>
                    <td className="px-3 py-2.5 pr-4 text-right">
                      <RegearStatusPill status={rg.status} t={t} />
                    </td>
                  </>
                )

                if (!linkable) {
                  return (
                    <tr key={rg.id} className="text-gray-300">
                      {cells}
                    </tr>
                  )
                }
                return (
                  <tr
                    key={rg.id}
                    className="text-gray-200 hover:bg-gray-800/40 transition-colors cursor-pointer"
                  >
                    <td colSpan={7} className="p-0">
                      <Link href={`/demo/regear/${rg.id}`} className="block">
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

      <p className="text-[11px] text-gray-600 italic px-1">{t('regear.demoOnlyDetail')}</p>
    </div>
  )
}
