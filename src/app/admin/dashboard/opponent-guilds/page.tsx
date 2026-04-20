import { getTranslations } from 'next-intl/server'
import { listOpponentGuilds } from '@/app/actions/opponent-guilds'
import OpponentGuildAdmin from '@/components/OpponentGuildAdmin'

export const dynamic = 'force-dynamic'

export default async function OpponentGuildsAdminPage() {
  const [{ guilds, error }, t] = await Promise.all([
    listOpponentGuilds(),
    getTranslations('adminOpponentGuilds'),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      <OpponentGuildAdmin initialGuilds={guilds} />
    </div>
  )
}
