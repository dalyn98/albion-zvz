import { redirect } from 'next/navigation'
import { Lock, ShieldAlert } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getFirstAccessibleAdminPath } from '@/lib/admin-route-access'
import { getSession } from '@/lib/session'
import InAppBrowserNoticeWithMessages from '@/components/InAppBrowserNoticeWithMessages'

const ERROR_KEY_MAP: Record<string, string> = {
  denied: 'errorDenied',
  invalid: 'errorInvalid',
  state_mismatch: 'errorStateMismatch',
  not_in_guild: 'errorNotInGuild',
  no_identity: 'errorNoIdentity',
  no_role: 'errorNoRole',
  server_error: 'errorServerError',
  not_admin: 'errorNotAdmin',
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  const t = await getTranslations('adminLogin')

  const resolveError = (): string | null => {
    if (!error) return null
    const key = ERROR_KEY_MAP[error]
    if (!key) return t('loginFailedFallback')
    return t(key as Parameters<typeof t>[0])
  }
  const errorMessage = resolveError()

  const session = await getSession()
  const firstAdminPath = getFirstAccessibleAdminPath(
    session?.isAdmin ?? false,
    session?.capabilities,
  )
  if (firstAdminPath) redirect(firstAdminPath)

  const loggedInAsNonAdmin = session && !session.isAdmin

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-amber-500/20 rounded-2xl mb-4">
            <Lock size={28} className="text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
          <p className="text-gray-400 text-sm mt-1">{t('subtitle')}</p>
        </div>

        {loggedInAsNonAdmin ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
              <ShieldAlert size={16} className="flex-shrink-0 mt-0.5" />
              <div>{t('noAdminRole', { username: session?.username ?? '' })}</div>
            </div>
            <form action="/api/auth/logout" method="post" className="text-center">
              <button
                type="submit"
                className="text-sm text-gray-400 hover:text-white"
              >
                {t('signInAsDifferent')}
              </button>
            </form>
          </div>
        ) : (
          <div className="space-y-4">
            <InAppBrowserNoticeWithMessages />
            <a
              href="/api/auth/discord/start?returnTo=/admin/dashboard"
              className="flex items-center justify-center gap-2 w-full bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold py-3 rounded-lg transition-colors"
            >
              <DiscordIcon />
              {t('loginWithDiscord')}
            </a>
            {errorMessage && <p className="text-red-400 text-sm text-center">{errorMessage}</p>}
            <p className="text-gray-500 text-xs text-center">
              {t('hint')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}
