import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import {
  ShieldCheck,
  Coins,
  Heart,
  ShoppingBag,
  Trophy,
  ChevronRight,
  ClipboardList,
} from 'lucide-react'
import type { AdminBadgeCounts } from '@/lib/admin-badges'

interface Props {
  badges: AdminBadgeCounts
}

interface PendingRow {
  count: number
  href: string
  labelKey:
    | 'regear'
    | 'exchange'
    | 'donation'
    | 'shop'
    | 'eventPayout'
    | 'craft'
  Icon: typeof ShieldCheck
}

export default async function HomeAdminPendingCard({ badges }: Props) {
  const t = await getTranslations('home.adminPending')

  // 어드민 사이드바 badge 와 동일한 데이터지만 home 에서 직접 액션 (deep link)
  // 가능하게 풀어 보여준다. 모바일에서 사이드바 햄버거 → 배지 탐색하지 않아도
  // 처리할 일을 한눈에 파악.
  const rows: PendingRow[] = [
    { count: badges.regear, href: '/admin/dashboard/regear', labelKey: 'regear', Icon: ShieldCheck },
    { count: badges.exchange, href: '/admin/dashboard/exchanges', labelKey: 'exchange', Icon: Coins },
    { count: badges.donation, href: '/admin/dashboard/donations', labelKey: 'donation', Icon: Heart },
    { count: badges.shop, href: '/admin/dashboard/shop', labelKey: 'shop', Icon: ShoppingBag },
    // event_payout_requests 는 별도 탭이 없어 통합 approvals 로 보낸다.
    { count: badges.eventPayout, href: '/admin/dashboard/approvals', labelKey: 'eventPayout', Icon: Trophy },
    { count: badges.craft, href: '/admin/dashboard/approvals?tab=craft', labelKey: 'craft', Icon: ClipboardList },
  ]

  const visible = rows.filter((r) => r.count > 0)
  if (visible.length === 0) return null

  const total = visible.reduce((sum, r) => sum + r.count, 0)

  return (
    <section className="bg-amber-500/5 border border-amber-500/30 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} className="text-amber-400" />
          <h2 className="text-xs font-semibold text-amber-200 uppercase tracking-wider">
            {t('title')}
          </h2>
          <span className="text-amber-300 text-xs font-mono">
            {t('totalCount', { count: total })}
          </span>
        </div>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {visible.map(({ count, href, labelKey, Icon }) => (
          <li key={labelKey}>
            <Link
              href={href}
              className="flex items-center justify-between gap-2 bg-gray-900/60 hover:bg-gray-800/80 border border-gray-800 hover:border-amber-500/40 rounded-lg px-3 py-2.5 transition-colors group"
            >
              <span className="flex items-center gap-2 min-w-0">
                <Icon size={14} className="text-amber-400 flex-shrink-0" />
                <span className="text-sm text-gray-200 truncate">{t(labelKey)}</span>
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-amber-300 font-mono text-sm font-bold">{count}</span>
                <ChevronRight size={14} className="text-gray-600 group-hover:text-amber-400 transition-colors" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
