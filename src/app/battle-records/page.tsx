import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listGuildRecords } from '@/app/actions/battle-records'
import GuildRecordsList from '@/components/GuildRecordsList'

export const dynamic = 'force-dynamic'

export default async function BattleRecordsPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/battle-records')
  }

  const [{ records, error }, t] = await Promise.all([
    listGuildRecords(),
    getTranslations('battleRecords'),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('title')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">{t('description')}</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {records.length === 0 && !error ? (
        <p className="text-gray-500 text-sm text-center py-8">{t('empty')}</p>
      ) : (
        <GuildRecordsList records={records} />
      )}
    </main>
  )
}
