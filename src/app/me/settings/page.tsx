import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Bell } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getMyDmPreference } from '@/app/actions/notifications'
import DmToggle from '@/components/DmToggle'

export const dynamic = 'force-dynamic'

export default async function MySettingsPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me/settings')
  }

  const t = await getTranslations('mySettings')
  const { enabled } = await getMyDmPreference()

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">{t('title')}</h1>
        <p className="text-xs text-gray-500 mt-1">{t('description')}</p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
          <Bell size={11} />
          {t('notificationsGroup')}
        </h2>
        <DmToggle initialEnabled={enabled} />
      </section>
    </main>
  )
}
