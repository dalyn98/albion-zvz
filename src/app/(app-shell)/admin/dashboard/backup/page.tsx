import { getTranslations } from 'next-intl/server'
import { requireAdmin } from '@/lib/auth'
import { getSession } from '@/lib/session'
import GuildBackupPanel from '@/components/GuildBackupPanel'
import { listGuildRecoveryReceipts } from '@/lib/guild-backup'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function GuildBackupPage() {
  const [session, db] = await Promise.all([getSession(), requireAdmin()])
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [t, timezone, recentReceipts] = await Promise.all([
    getTranslations('adminBackup'),
    getTenantTimezone(guildId),
    listGuildRecoveryReceipts(db, guildId),
  ])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{t('pageTitle')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pageSubtitle')}</p>
      </header>
      <GuildBackupPanel
        timezone={timezone}
        recentReceipts={recentReceipts}
      />
    </div>
  )
}
