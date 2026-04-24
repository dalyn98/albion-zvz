import { AlertTriangle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { formatRelativeCoarse } from '@/lib/relative-time'

// /admin/dashboard/shop 상단에 띄우는 이상 재고 경보 패널.
// 두 종류의 이상을 감지:
//   1. negative: stock < 0 — RPC 델타가 꼬이거나 미반영된 입고가 있을 때 발생.
//      재고 모델이 "빚진 상태" 라는 뜻이므로 무조건 눈에 보여야 한다.
//   2. stale:    stock > 0 인데 updated_at 이 STALE_DAYS 일 넘게 가만히 있는 경우.
//      드물게 들어오는 소모품 류는 정상이지만, 숫자가 크거나 너무 오래됐으면
//      실물이 이미 없는데 장부만 남은 "유령 재고" 일 가능성이 큼.
// 아무 이상도 없으면 null 반환 → 페이지에 아무 요소도 렌더되지 않음.

const STALE_DAYS = 30
const MAX_LIST = 20

interface AnomalyRow {
  uniqueName: string
  nameKo: string
  enchant: number
  quality: number
  stock: number
  updatedAt: string
}

export default async function ShopAnomalyPanel() {
  const db = await requireAdmin()
  const session = await getSession()
  if (!session) return null
  const guildId = await getSessionGuildId(session)
  const tTime = await getTranslations('time')

  // 서버 컴포넌트 요청 타임에 한 번만 평가되므로 Date.now() 가 idempotent 아닌
  // 건 맞지만 의도된 동작 — purity 룰은 클라 render 전제.
  // eslint-disable-next-line react-hooks/purity
  const staleCutoffIso = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [negativeRes, staleRes] = await Promise.all([
    db
      .from('shop_inventory')
      .select('unique_name, enchant, quality, stock, name_ko, updated_at')
      .eq('guild_id', guildId)
      .lt('stock', 0)
      .order('stock', { ascending: true })
      .limit(MAX_LIST),
    db
      .from('shop_inventory')
      .select('unique_name, enchant, quality, stock, name_ko, updated_at')
      .eq('guild_id', guildId)
      .gt('stock', 0)
      .lt('updated_at', staleCutoffIso)
      .order('updated_at', { ascending: true })
      .limit(MAX_LIST),
  ])

  const negatives: AnomalyRow[] = (negativeRes.data ?? []).map((r) => ({
    uniqueName: r.unique_name as string,
    nameKo: (r.name_ko as string | null) ?? (r.unique_name as string),
    enchant: r.enchant as number,
    quality: r.quality as number,
    stock: r.stock as number,
    updatedAt: r.updated_at as string,
  }))
  const stales: AnomalyRow[] = (staleRes.data ?? []).map((r) => ({
    uniqueName: r.unique_name as string,
    nameKo: (r.name_ko as string | null) ?? (r.unique_name as string),
    enchant: r.enchant as number,
    quality: r.quality as number,
    stock: r.stock as number,
    updatedAt: r.updated_at as string,
  }))

  if (negatives.length === 0 && stales.length === 0) return null

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 text-amber-200">
        <AlertTriangle size={16} />
        <h3 className="text-sm font-semibold">이상 재고 감지</h3>
        <span className="text-xs font-normal opacity-75">
          수치가 비정상이거나 오래 묵은 아이템입니다. 베이스라인 재설정으로 정리하세요.
        </span>
      </div>

      {negatives.length > 0 && (
        <AnomalySection
          title={`음수 재고 (${negatives.length}종)`}
          hint="RPC 델타가 꼬이거나 미반영된 입고가 있습니다. 0 으로 내려와야 할 재고가 마이너스."
          rows={negatives}
          showUpdatedAt={false}
          tone="rose"
          tTime={tTime}
        />
      )}

      {stales.length > 0 && (
        <AnomalySection
          title={`${STALE_DAYS}일 이상 미변동 (${stales.length}종)`}
          hint="장부상 재고는 있지만 오랫동안 입출고가 없었습니다. 실물이 없어진 유령 재고일 수 있어요."
          rows={stales}
          showUpdatedAt={true}
          tone="amber"
          tTime={tTime}
        />
      )}
    </div>
  )
}

interface AnomalySectionProps {
  title: string
  hint: string
  rows: AnomalyRow[]
  showUpdatedAt: boolean
  tone: 'rose' | 'amber'
  tTime: (key: string, values?: Record<string, number | string>) => string
}

function AnomalySection({ title, hint, rows, showUpdatedAt, tone, tTime }: AnomalySectionProps) {
  const titleColor = tone === 'rose' ? 'text-rose-200' : 'text-amber-200'
  const stockColor = tone === 'rose' ? 'text-rose-300' : 'text-zinc-200'
  return (
    <div className="space-y-1.5">
      <div className={`text-xs font-semibold ${titleColor}`}>{title}</div>
      <p className="text-[11px] text-zinc-400">{hint}</p>
      <div className="max-h-60 overflow-auto rounded-md border border-zinc-800 bg-zinc-950">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-zinc-900 text-zinc-400">
            <tr>
              <th className="p-2 text-left">아이템</th>
              <th className="p-2 text-center w-12">E</th>
              <th className="p-2 text-center w-12">Q</th>
              <th className="p-2 text-right w-20">재고</th>
              {showUpdatedAt && <th className="p-2 text-right w-32">최근 변동</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={`${r.uniqueName}|${r.enchant}|${r.quality}`}
                className="border-t border-zinc-800 text-zinc-200"
              >
                <td className="p-2">
                  <div>{r.nameKo}</div>
                  <div className="text-[10px] text-zinc-600">{r.uniqueName}</div>
                </td>
                <td className="p-2 text-center">{r.enchant}</td>
                <td className="p-2 text-center">{r.quality}</td>
                <td className={`p-2 text-right font-mono ${stockColor}`}>
                  {r.stock.toLocaleString('ko-KR')}
                </td>
                {showUpdatedAt && (
                  <td className="p-2 text-right font-mono text-zinc-500">
                    {formatRelativeCoarse(r.updatedAt, tTime)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

