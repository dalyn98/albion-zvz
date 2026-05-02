import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import GuildBackupPanel from '@/components/GuildBackupPanel'

export const dynamic = 'force-dynamic'

export default async function GuildBackupPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const t = await getTranslations('adminBackup')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('pageTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pageSubtitle')}</p>
      </header>
      <GuildBackupPanel />
    </div>
  )
}
