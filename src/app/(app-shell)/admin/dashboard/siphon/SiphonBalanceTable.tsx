// 사이펀 입출금 누적 — per-player 집계 표. server component.
//
// 정렬은 net asc (음수가 위, "출금 많은 사람" 부터). 이게 운영 시 가장 자주
// 보는 화면: "누가 사이펀을 많이 썼는지" 확인 → 길드 차원에서 보충 요청.

import { getTranslations } from 'next-intl/server'
import { Wallet } from 'lucide-react'
import type { SiphonPlayerBalance } from '@/app/actions/siphon-admin'
import { toZonedParts } from '@/lib/timezone'

interface Props {
  balances: SiphonPlayerBalance[]
  timezone: string
}

export default async function SiphonBalanceTable({ balances, timezone }: Props) {
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
        <>
          <div className="space-y-2 sm:hidden">
          {sorted.map((balance) => (
            <article key={balance.player} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="min-w-0 truncate text-sm font-semibold text-gray-100">
                  {balance.player}
                </h3>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-semibold uppercase text-gray-500">
                    {t('balanceNet')}
                  </p>
                  <p
                    className={`font-mono text-sm font-semibold ${
                      balance.net > 0
                        ? 'text-emerald-300'
                        : balance.net < 0
                          ? 'text-rose-300'
                          : 'text-gray-400'
                    }`}
                  >
                    {balance.net > 0 ? '+' : ''}
                    {balance.net.toLocaleString()}
                  </p>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                <div>
                  <dt className="text-gray-500">{t('balanceDeposited')}</dt>
                  <dd className="mt-0.5 font-mono text-emerald-300">+{balance.deposited.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-gray-500">{t('balanceWithdrawn')}</dt>
                  <dd className="mt-0.5 font-mono text-rose-300">-{balance.withdrawn.toLocaleString()}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-gray-500">{t('balanceLastActivity')}</dt>
                  <dd className="mt-0.5 text-gray-400">
                    {balance.lastActivityAt ? formatLoggedAt(balance.lastActivityAt, timezone) : '—'}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
          </div>

          <div className="hidden overflow-x-auto sm:block">
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
                    {b.lastActivityAt ? formatLoggedAt(b.lastActivityAt, timezone) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
