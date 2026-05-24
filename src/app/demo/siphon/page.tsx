'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  AlertTriangle,
  ListChecks,
  PackageCheck,
  PackageMinus,
  RotateCcw,
  Search,
  Sparkles,
  Zap,
} from 'lucide-react'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import { useDemoToast } from '../_components/DemoFeedbackProvider'
import {
  DEMO_SIPHON_BALANCES,
  DEMO_SIPHON_IMPORT_SAMPLE,
  DEMO_SIPHON_LEDGER,
  type DemoSiphonBalance,
  type DemoSiphonLedgerRow,
} from '@/data/demo-seed'
import { parseSiphonLog } from '@/lib/siphon/parse-siphon-log'
import { useConfirm } from '@/components/ConfirmDialog'

const SIPHON_TOUR_STEPS = [
  { id: 'siphon-import' },
  { id: 'siphon-reset' },
  { id: 'siphon-balances' },
  { id: 'siphon-ledger' },
] as const

export default function DemoSiphonPage() {
  const t = useTranslations('adminSiphonPage')
  const tDemo = useTranslations('demo.siphon')
  const { showToast } = useDemoToast()
  const askConfirm = useConfirm()
  const [rawLog, setRawLog] = useState(DEMO_SIPHON_IMPORT_SAMPLE)
  const [hasPreview, setHasPreview] = useState(true)
  const [playerFilter, setPlayerFilter] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState(tDemo('lastImportDemo'))
  const [ledgerSource, setLedgerSource] =
    useState<readonly DemoSiphonLedgerRow[]>(DEMO_SIPHON_LEDGER)
  const [balanceSource, setBalanceSource] =
    useState<readonly DemoSiphonBalance[]>(DEMO_SIPHON_BALANCES)

  const normalizedFilter = playerFilter.trim().toLowerCase()
  const balances = useMemo(
    () =>
      balanceSource.filter((balance) =>
        balance.player.toLowerCase().includes(normalizedFilter),
      ),
    [balanceSource, normalizedFilter],
  )
  const ledgerRows = useMemo(
    () =>
      ledgerSource.filter((row) =>
        row.player.toLowerCase().includes(normalizedFilter),
      ),
    [ledgerSource, normalizedFilter],
  )

  const preview = useMemo(() => parsePreview(rawLog), [rawLog])
  const canSave = hasPreview && preview.siphonRows > 0

  const handleAnalyze = () => {
    setHasPreview(true)
    showToast(tDemo('toastAnalyzed'))
  }

  const handleSave = () => {
    if (!canSave) return
    setLedgerSource(DEMO_SIPHON_LEDGER)
    setBalanceSource(DEMO_SIPHON_BALANCES)
    setLastSavedAt(tDemo('lastImportJustNow'))
    showToast(tDemo('toastSaved'))
  }

  const handleClear = () => {
    setRawLog('')
    setHasPreview(false)
    showToast(tDemo('toastCleared'))
  }

  const handleReset = async () => {
    const ok = await askConfirm({
      body: t('resetConfirm'),
      destructive: true,
    })
    if (!ok) return

    setRawLog('')
    setHasPreview(false)
    setPlayerFilter('')
    setLedgerSource([])
    setBalanceSource([])
    setLastSavedAt(tDemo('lastImportJustNow'))
    showToast(tDemo('toastReset'))
  }

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={SIPHON_TOUR_STEPS} namespace="siphon" />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Zap size={22} className="text-amber-300" />
          {t('title')}
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl leading-relaxed">{t('description')}</p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemo('notice')}</p>
      </div>

      <section
        data-tour-id="siphon-import"
        className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('importTitle')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('importDescription')}</p>
          </div>
          <span className="rounded-full border border-gray-700 bg-gray-950 px-3 py-1 text-xs text-gray-400">
            {tDemo('lastImport', { time: lastSavedAt })}
          </span>
        </div>

        <textarea
          value={rawLog}
          onChange={(event) => setRawLog(event.target.value)}
          placeholder={t('importPlaceholder')}
          className="min-h-36 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs font-mono text-gray-100 outline-none transition-colors focus:border-amber-500"
        />

        {hasPreview && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <PreviewMetric label={t('previewParsed')} value={preview.parsedTotal} />
            <PreviewMetric label={t('previewSiphon')} value={preview.siphonRows} tone="emerald" />
            <PreviewMetric label={t('previewNonSiphon')} value={preview.nonSiphonRows} />
            <PreviewMetric label={t('previewPlayers')} value={preview.affectedPlayers} />
            <PreviewMetric label={t('previewDeposit')} value={`+${preview.depositTotal}`} tone="emerald" />
            <PreviewMetric label={t('previewWithdraw')} value={preview.withdrawTotal} tone="rose" />
            <PreviewMetric label={t('previewDuplicates')} value={0} />
            <PreviewMetric label={tDemo('previewStatus')} value={tDemo('previewReady')} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleAnalyze}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400"
          >
            <ListChecks size={15} />
            {t('manualSubmit')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:border-gray-800 disabled:bg-gray-900 disabled:text-gray-600"
          >
            {t('saveButtonWithCount', { items: preview.siphonRows })}
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:border-gray-500"
          >
            {t('discard')}
          </button>
        </div>
      </section>

      <section
        data-tour-id="siphon-reset"
        className="rounded-xl border border-rose-900/50 bg-rose-950/10 p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" />
            <div className="min-w-0">
              <h2 className="font-bold text-white">{t('resetTitle')}</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-rose-100/75">
                {t('resetDescription')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-rose-500 sm:w-auto"
          >
            <RotateCcw size={14} />
            {t('resetButton')}
          </button>
        </div>
      </section>

      <section data-tour-id="siphon-balances" className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('balanceTitle')}</h2>
            <p className="text-sm text-gray-400 mt-1">{t('balanceDescription')}</p>
          </div>
          <label className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={playerFilter}
              onChange={(event) => setPlayerFilter(event.target.value)}
              placeholder={tDemo('playerSearchPlaceholder')}
              className="w-full rounded-lg border border-gray-700 bg-gray-950 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-amber-500"
            />
          </label>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-950 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">{t('balancePlayer')}</th>
                <th className="px-3 py-2 text-right">{t('balanceDeposited')}</th>
                <th className="px-3 py-2 text-right">{t('balanceWithdrawn')}</th>
                <th className="px-3 py-2 text-right">{t('balanceNet')}</th>
                <th className="px-3 py-2 text-left">{t('balanceLastActivity')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {balances.length > 0 ? (
                balances.map((balance) => (
                  <BalanceRow key={balance.player} balance={balance} />
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                    {t('balanceEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section data-tour-id="siphon-ledger" className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('logTitle')}</h2>
          <p className="text-sm text-gray-400 mt-1">{tDemo('ledgerDescription')}</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-950 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">{t('logTimestamp')}</th>
                <th className="px-3 py-2 text-left">{t('logPlayer')}</th>
                <th className="px-3 py-2 text-right">{t('logQuantity')}</th>
                <th className="px-3 py-2 text-left">{t('logImportedBy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {ledgerRows.length > 0 ? (
                ledgerRows.map((row) => <LedgerRow key={row.id} row={row} />)
              ) : (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                    {t('logEmpty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function parsePreview(raw: string): {
  parsedTotal: number
  siphonRows: number
  nonSiphonRows: number
  depositTotal: number
  withdrawTotal: number
  affectedPlayers: number
} {
  const result = parseSiphonLog(raw)
  const quantities = result.entries.map((entry) => entry.quantity)
  const players = new Set(result.entries.map((entry) => entry.player))

  return {
    parsedTotal: result.parsedTotal,
    siphonRows: result.entries.length,
    nonSiphonRows: result.nonSiphonRows,
    depositTotal: quantities.filter((qty) => qty > 0).reduce((sum, qty) => sum + qty, 0),
    withdrawTotal: quantities.filter((qty) => qty < 0).reduce((sum, qty) => sum + qty, 0),
    affectedPlayers: players.size,
  }
}

function PreviewMetric({
  label,
  value,
  tone = 'default',
}: {
  label: string
  value: string | number
  tone?: 'default' | 'emerald' | 'rose'
}) {
  const valueClass =
    tone === 'emerald' ? 'text-emerald-300' : tone === 'rose' ? 'text-rose-300' : 'text-white'
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 font-mono text-sm font-bold ${valueClass}`}>{value}</p>
    </div>
  )
}

function BalanceRow({ balance }: { balance: DemoSiphonBalance }) {
  const netClass = balance.net < 0 ? 'text-rose-300' : balance.net > 0 ? 'text-emerald-300' : 'text-white'
  return (
    <tr>
      <td className="px-3 py-2 font-semibold text-white">{balance.player}</td>
      <td className="px-3 py-2 text-right font-mono text-emerald-300">
        {formatSignedCount(balance.deposited)}
      </td>
      <td className="px-3 py-2 text-right font-mono text-rose-300">
        {formatSignedCount(-balance.withdrawn)}
      </td>
      <td className={`px-3 py-2 text-right font-mono font-bold ${netClass}`}>
        {balance.net > 0 ? '+' : ''}
        {balance.net}
      </td>
      <td className="px-3 py-2 text-xs text-gray-400">{balance.lastActivityAt}</td>
    </tr>
  )
}

function formatSignedCount(value: number): string {
  if (value === 0) return '0'
  return value > 0 ? `+${value}` : String(value)
}

function LedgerRow({ row }: { row: DemoSiphonLedgerRow }) {
  const deposit = row.quantity > 0
  return (
    <tr>
      <td className="px-3 py-2 text-xs font-mono text-gray-400">{row.loggedAt}</td>
      <td className="px-3 py-2 font-semibold text-white">{row.player}</td>
      <td className={`px-3 py-2 text-right font-mono font-bold ${deposit ? 'text-emerald-300' : 'text-rose-300'}`}>
        <span className="inline-flex items-center justify-end gap-1">
          {deposit ? <PackageCheck size={12} /> : <PackageMinus size={12} />}
          {deposit ? '+' : ''}
          {row.quantity}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-gray-400">{row.importedBy}</td>
    </tr>
  )
}
