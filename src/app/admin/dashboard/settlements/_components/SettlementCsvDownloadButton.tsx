'use client'

import { Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { SettlementLine, SettlementPeriodSummary } from '@/app/actions/settlements'

interface Props {
  period: SettlementPeriodSummary
  lines: SettlementLine[]
}

export default function SettlementCsvDownloadButton({ period, lines }: Props) {
  const t = useTranslations('adminSettlements')

  const downloadCsv = () => {
    const headers = [
      t('csvDiscordId'),
      t('csvUsername'),
      t('csvOpening'),
      t('csvEarned'),
      t('csvSpent'),
      t('csvClosing'),
      t('csvReceivable'),
      t('csvPayable'),
      t('csvLedgerCount'),
    ]
    const body = lines.map((line) => [
      line.discordId,
      line.username ?? '',
      String(line.openingBalance),
      String(line.earned),
      String(line.spent),
      String(line.closingBalance),
      String(line.receivableSilver),
      String(line.payableSilver),
      String(line.ledgerEntryCount),
    ])
    const csv = `\uFEFF${[headers, ...body].map((row) => row.map(escapeCsvCell).join(',')).join('\n')}`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `settlement-${period.periodStart}-${period.periodEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={downloadCsv}
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-600 px-3 py-2 text-sm font-semibold text-gray-200 hover:border-amber-500/50 hover:text-amber-200"
    >
      <Download size={15} />
      {t('downloadCsv')}
    </button>
  )
}

function escapeCsvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
