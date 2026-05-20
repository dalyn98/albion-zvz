// 사이펀 입출금 누적 — per-player 집계 표. server component.
//
// 정렬은 net asc (음수가 위, "출금 많은 사람" 부터). 이게 운영 시 가장 자주
// 보는 화면: "누가 사이펀을 많이 썼는지" 확인 → 길드 차원에서 보충 요청.

import { getTranslations } from 'next-intl/server'
import { Wallet } from 'lucide-react'
import type { SiphonPlayerBalance } from '@/app/actions/siphon-admin'
import { DEFAULT_TENANT_TIMEZONE, toZonedParts } from '@/lib/timezone'

interface Props {
  balances: SiphonPlayerBalance[]
}

export default async function SiphonBalanceTable({ balances }: Props) {
  const t = await getTranslations('adminSiphonPage')
  // net asc → "많이 쓴 사람" 위. 같은 net 이면 player 알파벳 순.
  const sorted = [...balances].sort((a, b) => {
    if (a.net !== b.net) return a.net - b.net
    return a.player.localeCompare(b.player)
  })

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet size={16} className="text-amber-400" />
        <h2 className="font-bold text-white">{t('balanceTitle')}</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        {t('balanceDescription')}
      </p>

      {sorted.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">
          {t('balanceEmpty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800">
                <th className="text-left font-normal pb-2">
                  {t('balancePlayer')}
                </th>
                <th className="text-right font-normal pb-2 w-24">
                  {t('balanceDeposited')}
                </th>
                <th className="text-right font-normal pb-2 w-24">
                  {t('balanceWithdrawn')}
                </th>
                <th className="text-right font-normal pb-2 w-24">
                  {t('balanceNet')}
                </th>
                <th className="text-right font-normal pb-2 w-32">
                  {t('balanceLastActivity')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((b) => (
                <tr
                  key={b.player}
                  className="border-b border-gray-800/50"
                >
                  <td className="py-1.5 text-gray-200 text-sm">{b.player}</td>
                  <td className="py-1.5 text-right text-xs font-mono text-emerald-300">
                    +{b.deposited.toLocaleString()}
                  </td>
                  <td className="py-1.5 text-right text-xs font-mono text-rose-300">
                    -{b.withdrawn.toLocaleString()}
                  </td>
                  <td
                    className={`py-1.5 text-right text-sm font-mono font-semibold ${
                      b.net > 0
                        ? 'text-emerald-300'
                        : b.net < 0
                          ? 'text-rose-300'
                          : 'text-gray-400'
                    }`}
                  >
                    {b.net > 0 ? '+' : ''}
                    {b.net.toLocaleString()}
                  </td>
                  <td className="py-1.5 text-right text-xs text-gray-500">
                    {b.lastActivityAt ? formatLoggedAt(b.lastActivityAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatLoggedAt(iso: string): string {
  if (Number.isNaN(new Date(iso).getTime())) return iso
  const p = toZonedParts(iso, DEFAULT_TENANT_TIMEZONE)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}
