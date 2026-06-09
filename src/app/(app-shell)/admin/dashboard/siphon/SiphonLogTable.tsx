// 원본 사이펀 로그 표. 시간 역순, 페이지네이션. 삭제 버튼은 클라이언트
// 측에서 confirm + server action 호출.

import Link from 'next/link'
import { ScrollText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import type { SiphonLedgerRow } from '@/app/actions/siphon-admin'
import { toZonedParts } from '@/lib/timezone'
import SiphonRowDeleteButton from './SiphonRowDeleteButton'

interface Props {
  rows: SiphonLedgerRow[]
  total: number
  page: number
  pageSize: number
  playerFilter: string | null
  timezone: string
}

export default async function SiphonLogTable({
  rows,
  total,
  page,
  pageSize,
  playerFilter,
  timezone,
}: Props) {
  const t = await getTranslations('adminSiphonPage')
  const offsetStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const offsetEnd = Math.min(page * pageSize, total)
  const hasPrev = page > 1
  const hasNext = page * pageSize < total

  const buildHref = (nextPage: number) => {
    const params = new URLSearchParams()
    if (nextPage > 1) params.set('page', String(nextPage))
    if (playerFilter) params.set('player', playerFilter)
    const qs = params.toString()
    return qs ? `/admin/dashboard/siphon?${qs}` : '/admin/dashboard/siphon'
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText size={16} className="text-sky-400" />
        <h2 className="font-bold text-white">{t('logTitle')}</h2>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          {t('logEmpty')}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-left font-normal pb-2 w-36">
                    {t('logTimestamp')}
                  </th>
                  <th className="text-left font-normal pb-2">
                    {t('logPlayer')}
                  </th>
                  <th className="text-right font-normal pb-2 w-20">
                    {t('logQuantity')}
                  </th>
                  <th className="text-left font-normal pb-2 w-32">
                    {t('logImportedBy')}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-800/50">
                    <td className="py-1.5 text-xs text-gray-400 font-mono">
                      {formatLoggedAt(r.loggedAt, timezone)}
                    </td>
                    <td className="py-1.5 text-sm text-gray-200">
                      {r.player}
                    </td>
                    <td
                      className={`py-1.5 text-right text-xs font-mono font-semibold ${
                        r.quantity > 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {r.quantity > 0 ? '+' : ''}
                      {r.quantity.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-xs text-gray-500">
                      {r.importedBy ?? '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      <SiphonRowDeleteButton id={r.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-gray-500">
              {t('logPageInfo', { offsetStart, offsetEnd, total })}
            </p>
            <div className="flex items-center gap-2">
              {hasPrev ? (
                <Link
                  href={buildHref(page - 1)}
                  className="px-2 py-1 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  {t('logPagePrev')}
                </Link>
              ) : (
                <span className="px-2 py-1 text-xs rounded border border-gray-800 text-gray-600">
                  {t('logPagePrev')}
                </span>
              )}
              {hasNext ? (
                <Link
                  href={buildHref(page + 1)}
                  className="px-2 py-1 text-xs rounded border border-gray-700 text-gray-300 hover:bg-gray-800"
                >
                  {t('logPageNext')}
                </Link>
              ) : (
                <span className="px-2 py-1 text-xs rounded border border-gray-800 text-gray-600">
                  {t('logPageNext')}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function formatLoggedAt(iso: string, timezone: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return iso
  const p = toZonedParts(iso, timezone)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
