import { AlertTriangle, CheckCircle2, ScrollText, Sparkles, Upload } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import DemoCTACard from '../_components/DemoCTACard'
import DemoActionButton from '../_components/DemoActionButton'
import type { ReactNode } from 'react'

export const dynamic = 'force-dynamic'

const SAMPLE_FINDINGS = [
  {
    member: 'MonKKu',
    item: "Elder's Hellion Jacket",
    expected: 3,
    deposited: 1,
    missing: 2,
    value: 1280000,
    status: 'open',
  },
  {
    member: 'Chovy',
    item: "Elder's Cleric Robe",
    expected: 2,
    deposited: 2,
    missing: 0,
    value: 0,
    status: 'resolved',
  },
  {
    member: 'Tagilla',
    item: "Master's Locus",
    expected: 1,
    deposited: 0,
    missing: 1,
    value: 740000,
    status: 'open',
  },
] as const

export default async function DemoLootAuditPage() {
  const [t, tDemo, tCta] = await Promise.all([
    getTranslations('adminLootAuditPage'),
    getTranslations('demo.lootAudit'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <ScrollText size={22} className="text-amber-300" />
          <h1 className="text-2xl font-semibold text-white">{t('title')}</h1>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-gray-400">{t('description')}</p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemo('notice')}</p>
      </div>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <DemoLogDropzone
            icon={<Upload size={15} />}
            label={t('lootLogLabel')}
            placeholder={t('lootLogPlaceholder')}
          />
          <DemoLogDropzone
            icon={<Upload size={15} />}
            label={t('depositLogLabel')}
            placeholder={t('depositLogPlaceholder')}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <DemoActionButton className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black">
            {t('preview')}
          </DemoActionButton>
          <DemoActionButton className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-200">
            {t('save')}
          </DemoActionButton>
          <DemoActionButton className="rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300">
            {t('clear')}
          </DemoActionButton>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        <Metric label={t('statLootRows')} value="186" />
        <Metric label={t('statDepositRows')} value="142" />
        <Metric label={t('statSkippedBeforeStart')} value="12" />
        <Metric label={t('statFindings')} value="4" tone="amber" />
        <Metric label={t('statMissingValue')} value={formatSilver(2020000)} tone="rose" />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('findingsTitle')}</h2>
          <p className="mt-1 text-sm text-gray-400">{tDemo('findingsDescription')}</p>
        </div>
        <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900/60">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-700 bg-gray-800/70 text-xs text-gray-400">
              <tr>
                <th className="px-3 py-2 font-medium">{t('colMember')}</th>
                <th className="px-3 py-2 font-medium">{t('colItem')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('colExpected')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('colDeposited')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('colMissing')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('colMissingValue')}</th>
                <th className="px-3 py-2 font-medium">{t('colStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {SAMPLE_FINDINGS.map((finding) => (
                <tr key={`${finding.member}-${finding.item}`} className="text-gray-200">
                  <td className="px-3 py-3 font-semibold text-white">{finding.member}</td>
                  <td className="px-3 py-3 text-gray-300">{finding.item}</td>
                  <td className="px-3 py-3 text-right font-mono">{finding.expected}</td>
                  <td className="px-3 py-3 text-right font-mono">{finding.deposited}</td>
                  <td className="px-3 py-3 text-right font-mono text-amber-200">
                    {finding.missing}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-rose-200">
                    {formatSilver(finding.value)}
                  </td>
                  <td className="px-3 py-3">
                    {finding.status === 'resolved' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                        <CheckCircle2 size={12} />
                        {t('statusResolved')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-200">
                        <AlertTriangle size={12} />
                        {t('statusOpen')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemo('ctaTitle')}
        description={tDemo('ctaDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

function DemoLogDropzone({
  icon,
  label,
  placeholder,
}: {
  icon: ReactNode
  label: string
  placeholder: string
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-700 bg-gray-950 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
        <span className="text-amber-300">{icon}</span>
        {label}
      </div>
      <p className="min-h-16 rounded border border-gray-800 bg-black/20 p-3 font-mono text-xs text-gray-500">
        {placeholder}
      </p>
    </div>
  )
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'amber' | 'rose'
}) {
  const valueClass =
    tone === 'amber' ? 'text-amber-200' : tone === 'rose' ? 'text-rose-200' : 'text-white'
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}

function formatSilver(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}
