import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Coins } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import MemberWalletSection from '@/components/MemberWalletSection'
import MemberEconomyNav from '@/components/MemberEconomyNav'

export const dynamic = 'force-dynamic'

export default async function MyWalletPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me/wallet')
  }
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)
  const [t, tCommon, tNav] = await Promise.all([
    getTranslations('me'),
    getTranslations('common'),
    getTranslations('nav'),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <Link
          href="/me"
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 mb-2"
        >
          <ArrowLeft size={14} />
          {tCommon('backToMyPage')}
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
          <Coins size={22} className="text-amber-300" />
          {t('walletTitle')}
        </h1>
        <p className="text-gray-400 text-sm">{t('walletDescription')}</p>
      </div>

      <MemberEconomyNav
        active="wallet"
        ariaLabel={tNav('economy')}
        labels={{
          wallet: tNav('wallet'),
          shop: tNav('shop'),
          market: tNav('memberMarket'),
        }}
      />

      <MemberWalletSection guildId={guildId} discordId={session.discordId} />
    </main>
  )
}
