import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DEMO_REGEAR_DETAIL, type DemoRegearSlot } from '@/data/demo-seed'
import { formatTimeLabel, formatSilverFull } from '../../_lib/format'
import { RegearStatusPill, RegearOriginPill } from '../../_components/Pills'
import DemoGuidedTour from '../../_components/DemoGuidedTour'

const SLOT_KEY: Record<DemoRegearSlot, string> = {
  head: 'regear.slotHead',
  armor: 'regear.slotArmor',
  shoes: 'regear.slotShoes',
  weapon: 'regear.slotWeapon',
  offhand: 'regear.slotOffhand',
  cape: 'regear.slotCape',
}
const REGEAR_DETAIL_TOUR_STEPS = [
  { id: 'regear-detail-summary' },
  { id: 'regear-detail-pieces' },
] as const

export default async function DemoRegearDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (id !== DEMO_REGEAR_DETAIL.id) notFound()

  const t = await getTranslations('demo')
  const rg = DEMO_REGEAR_DETAIL

  return (
    <div className="space-y-4">
      <DemoGuidedTour steps={REGEAR_DETAIL_TOUR_STEPS} namespace="regearDetail" />
      <Link
        href="/demo/regear"
        className="inline-block text-xs text-gray-500 hover:text-amber-400 transition-colors"
      >
        {t('regear.back')}
      </Link>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('regear.detailTitle')}</h1>
          <RegearStatusPill status={rg.status} t={t} />
          <RegearOriginPill origin={rg.origin} t={t} />
        </div>
      </header>

      <dl data-tour-id="regear-detail-summary" className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-900 border border-gray-800 rounded-lg p-3">
        <Field label={t('regear.victimLabel')} value={rg.victim} />
        <Field label={t('regear.battleLabel')} value={rg.battleLabel} />
        <Field label={t('regear.diedLabel')} value={formatTimeLabel(t, rg.diedAt)} />
        <Field label={t('regear.killerLabel')} value={`${rg.killerName} · ${rg.killerWeapon}`} />
      </dl>

      <section data-tour-id="regear-detail-pieces" className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
        <header className="bg-gray-950 px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-200">
          {t('regear.piecesTitle')}
        </header>
        <table className="w-full text-xs">
          <thead className="bg-gray-950 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-3 py-1.5">{t('regear.pieceColSlot')}</th>
              <th className="text-left px-3 py-1.5">{t('regear.pieceColItem')}</th>
              <th className="text-right px-3 py-1.5 pr-4">{t('regear.pieceColEstimate')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rg.pieces.map((p) => (
              <tr key={p.slot} className="text-gray-200">
                <td className="px-3 py-2 text-gray-400">{t(SLOT_KEY[p.slot])}</td>
                <td className="px-3 py-2">{p.itemLabel}</td>
                <td className="px-3 py-2 pr-4 text-right font-mono text-amber-400">
                  {formatSilverFull(p.estimatedSilver)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-gray-700">
            <tr className="bg-gray-950">
              <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-300">
                {t('regear.totalLabel')}
              </td>
              <td className="px-3 py-2 pr-4 text-right font-mono font-bold text-amber-300 text-sm">
                {formatSilverFull(rg.totalSilver)} {t('common.silver')}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</dt>
      <dd className="text-xs text-gray-200 mt-0.5">{value}</dd>
    </div>
  )
}
