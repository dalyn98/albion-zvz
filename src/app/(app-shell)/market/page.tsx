import { Lock, LogIn, Store } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import {
  getMyMemberTradePointSummary,
  listMemberTradeListings,
  listMyMemberTradeOrders,
  listMyMemberTradePriceOffers,
} from '@/app/actions/member-trade'
import MemberTradeMarket from '@/components/MemberTradeMarket'
import MemberEconomyNav from '@/components/MemberEconomyNav'
import { getPrimaryTenantId, getSessionGuildId } from '@/lib/tenant'
import { loadGuildFeatureSnapshot } from '@/lib/guild-features-server'
import { isGuildFeatureDiscoverable } from '@/lib/guild-features'

export const dynamic = 'force-dynamic'

export default async function MemberTradeMarketPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const params = await searchParams
  const session = await getSession()
  const guildId = session ? await getSessionGuildId(session) : await getPrimaryTenantId()
  const [tNav, t, listingsResult, ordersResult, offersResult, pointSummary, featureSnapshot] = await Promise.all([
    getTranslations('nav'),
    getTranslations('memberTrade'),
    listMemberTradeListings(),
    listMyMemberTradeOrders(),
    listMyMemberTradePriceOffers(),
    getMyMemberTradePointSummary(),
    loadGuildFeatureSnapshot(guildId),
  ])
  const isMember = session?.isMember ?? false

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:py-8 lg:max-w-5xl xl:max-w-[1440px] 2xl:max-w-[1680px]">
      <div className="flex items-center gap-2">
        <Store size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('memberMarket')}</h1>
      </div>

      <MemberEconomyNav
        active="market"
        ariaLabel={tNav('economy')}
        labels={{
          wallet: tNav('wallet'),
          shop: tNav('shop'),
          market: tNav('memberMarket'),
        }}
        available={{
          wallet: isGuildFeatureDiscoverable(featureSnapshot.guild_economy.state),
          shop: isGuildFeatureDiscoverable(featureSnapshot.guild_shop.state),
          market: isGuildFeatureDiscoverable(featureSnapshot.member_market.state),
        }}
      />

      {!session && (
        <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-4 py-3">
          <LogIn size={14} className="text-amber-400" />
          <p className="text-xs text-gray-300">
            {t('loginRequiredPrefix')}
            <Link
              href="/login?returnTo=%2Fmarket"
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
          {(listingsResult.error || ordersResult.error || offersResult.error) && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
              <p className="text-sm text-red-300">
                {listingsResult.error ?? ordersResult.error ?? offersResult.error}
              </p>
            </div>
          )}
          <MemberTradeMarket
            listings={listingsResult.listings}
            orders={ordersResult.orders}
            offers={offersResult.offers}
            pointSummary={pointSummary}
            isMember={isMember}
            initialTab={params.tab === 'orders' ? 'orders' : 'buy'}
          />
        </>
      )}
    </main>
  )
}
