import { redirect } from 'next/navigation'
import { Bot, AlertCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getKillbotAdminState } from '@/app/actions/killbot-admin'
import { CAP } from '@/lib/permissions'
import { getSession, sessionHasAny } from '@/lib/session'
import KillbotSettingsClient from './KillbotSettingsClient'

export const dynamic = 'force-dynamic'

const KILLBOT_MANAGE_CAPS = [CAP.SETTINGS_GENERAL] as const

export default async function AdminKillbotPage() {
  const session = await getSession()
  if (!session) redirect('/')
  if (!session.isAdmin && !sessionHasAny(session, KILLBOT_MANAGE_CAPS)) {
    redirect('/admin/dashboard')
  }

  const [t, result] = await Promise.all([
    getTranslations('adminKillbotPage'),
    getKillbotAdminState(),
  ])

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Bot size={22} className="text-amber-300" />
          <h1 className="text-2xl font-semibold text-white">{t('title')}</h1>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-gray-400">
          {t('description')}
        </p>
      </header>

      {result.error || !result.state ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-700/50 bg-red-900/25 px-4 py-3 text-sm text-red-200">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <p>{result.error ?? t('loadError')}</p>
        </div>
      ) : (
        <KillbotSettingsClient initialState={result.state} />
      )}
    </div>
  )
}
