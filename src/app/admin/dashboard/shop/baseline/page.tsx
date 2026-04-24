import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import ShopBaselineForm from '@/components/ShopBaselineForm'

export const dynamic = 'force-dynamic'

export default async function ShopBaselinePage() {
  const db = await requireAdmin()
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)

  // 이력 표시용 — 최근 10건 (confirmed / superseded 모두 포함)
  const { data: history } = await db
    .from('shop_baselines')
    .select('id, baseline_at, total_items, total_events, confirmed_at, confirmed_by, status, depositor, notes')
    .eq('guild_id', guildId)
    .order('confirmed_at', { ascending: false })
    .limit(10)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={22} className="text-amber-400" />
          <h1 className="text-2xl font-bold text-white">상자 재고 베이스라인</h1>
        </div>
        <Link
          href="/admin/dashboard/shop"
          className="flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft size={14} />
          상점 관리로
        </Link>
      </div>

      <ShopBaselineForm />

      {history && history.length > 0 && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-2">
          <div className="text-sm font-semibold text-zinc-200">이력 (최근 10건)</div>
          <div className="overflow-auto">
            <table className="w-full text-xs text-zinc-300">
              <thead className="text-zinc-500">
                <tr>
                  <th className="p-2 text-left">확정 시각</th>
                  <th className="p-2 text-left">베이스라인 시각</th>
                  <th className="p-2 text-right">아이템</th>
                  <th className="p-2 text-left">입고자</th>
                  <th className="p-2 text-left">상태</th>
                  <th className="p-2 text-left">메모</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id as string} className="border-t border-zinc-800">
                    <td className="p-2 font-mono">
                      {new Date(row.confirmed_at as string).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-2 font-mono">
                      {new Date(row.baseline_at as string).toLocaleString('ko-KR', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="p-2 text-right font-mono">
                      {(row.total_items as number).toLocaleString('ko-KR')} / {row.total_events as number}건
                    </td>
                    <td className="p-2">{(row.depositor as string | null) ?? '—'}</td>
                    <td className="p-2">
                      {row.status === 'confirmed' ? (
                        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-300">active</span>
                      ) : (
                        <span className="rounded bg-zinc-700 px-2 py-0.5 text-zinc-400">superseded</span>
                      )}
                    </td>
                    <td className="p-2 text-zinc-500">{(row.notes as string | null) ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
