import { Lock, LogIn, Store } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import {
  getMyMemberTradePointSummary,
  listMemberTradeListings,
  listMyMemberTradeOrders,
} from '@/app/actions/member-trade'
import MemberTradeMarket from '@/components/MemberTradeMarket'

export const dynamic = 'force-dynamic'

export default async function MemberTradeMarketPage() {
  const session = await getSession()
  const [tNav, t, listingsResult, ordersResult, pointSummary] = await Promise.all([
    getTranslations('nav'),
    getTranslations('memberTrade'),
    listMemberTradeListings(),
    listMyMemberTradeOrders(),
    getMyMemberTradePointSummary(),
  ])
  const isMember = session?.isMember ?? false

  return (
    <div className="max-w-7xl space-y-5">
      <div className="flex items-center gap-2">
        <Store size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('memberMarket')}</h1>
      </div>

      {!session && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3">
          <LogIn size={14} className="text-amber-400" />
          <p className="text-xs text-gray-300">
            {t('loginRequiredPrefix')}
            <Link
              href="/api/auth/discord/start?returnTo=%2Fmarket"
              className="text-amber-300 underline"
            >
              {t('loginLink')}
            </Link>
            {t('loginRequiredSuffix')}
          </p>
        </div>
      )}

      {session && !isMember && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3">
          <Lock size={14} className="text-amber-400" />
          <p className="text-xs text-gray-300">{t('memberOnly')}</p>
        </div>
      )}

      {isMember && (
        <>
          {(listingsResult.error || ordersResult.error) && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-300">
                {listingsResult.error ?? ordersResult.error}
              </p>
            </div>
          )}
          <MemberTradeMarket
            listings={listingsResult.listings}
            orders={ordersResult.orders}
            pointSummary={pointSummary}
            isMember={isMember}
          />
        </>
      )}
    </div>
  )
}
