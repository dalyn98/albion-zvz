import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import GuildBackupPanel from '@/components/GuildBackupPanel'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function GuildBackupPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [t, timezone] = await Promise.all([
    getTranslations('adminBackup'),
    getTenantTimezone(guildId),
  ])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('pageTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pageSubtitle')}</p>
      </header>
      <GuildBackupPanel timezone={timezone} />
    </div>
  )
}
