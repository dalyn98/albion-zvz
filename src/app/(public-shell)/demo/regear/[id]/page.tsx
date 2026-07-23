import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { DEMO_REGEAR_DETAILS, type DemoRegearSlot } from '@/data/demo-seed'
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
  const rg = DEMO_REGEAR_DETAILS.find((detail) => detail.id === id)
  if (!rg) notFound()

  const [t, tMe, tBreakdown] = await Promise.all([
    getTranslations('demo'),
    getTranslations('me'),
    getTranslations('regearBreakdown'),
  ])
  const isOvercharge = rg.requestType === 'overcharge'
  const hasPieces = rg.pieces.length > 0

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
          {isOvercharge && (
            <span className="inline-flex rounded bg-orange-500 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black">
              {tMe('regearOverchargeBadge')}
            </span>
          )}
        </div>
      </header>

      <dl data-tour-id="regear-detail-summary" className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-900 border border-gray-800 rounded-lg p-3">
        <Field label={t('regear.victimLabel')} value={rg.victim} />
        <Field label={t('regear.battleLabel')} value={rg.battleLabel} />
        <Field
          label={isOvercharge ? t('regear.occurredLabel') : t('regear.diedLabel')}
          value={formatTimeLabel(t, rg.diedAt)}
        />
        <Field
          label={isOvercharge ? t('regear.contextLabel') : t('regear.killerLabel')}
          value={`${rg.killerName} · ${rg.killerWeapon}`}
        />
      </dl>

      {isOvercharge && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs leading-relaxed text-orange-200">
          <ShieldAlert size={14} className="mt-0.5 shrink-0" />
          <span>{tMe('regearOverchargeNoKillboard')}</span>
        </div>
      )}

      {hasPieces ? (
        <section data-tour-id="regear-detail-pieces" className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
          <header className="bg-gray-950 px-3 py-2 border-b border-gray-800 text-xs font-semibold text-gray-200">
            {t('regear.piecesTitle')}
          </header>
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full min-w-[30rem] text-xs">
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
          </div>
        </section>
      ) : (
        <section data-tour-id="regear-detail-pieces" className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h2 className="text-sm font-semibold text-white">{tBreakdown('manualClaimLabel')}</h2>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <Field
              label={t('regear.totalLabel')}
              value={`${formatSilverFull(rg.totalSilver)} ${t('common.silver')}`}
            />
            {rg.capSilver && (
              <Field
                label={tMe('ceiling')}
                value={`${formatSilverFull(rg.capSilver)} ${t('common.silver')}`}
              />
            )}
          </dl>
        </section>
      )}
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
