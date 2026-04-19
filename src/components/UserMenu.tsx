import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { LogIn, LogOut, UserCircle2, Wallet } from 'lucide-react'
import type { SessionPayload } from '@/lib/session'

interface Props {
  session: SessionPayload | null
  loginHref: string
}

function avatarUrl(discordId: string, avatar: string | null): string | null {
  if (!avatar) return null
  // Animated avatars start with "a_" and support .gif; static avatars use .png.
  const ext = avatar.startsWith('a_') ? 'gif' : 'png'
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=64`
}

export default async function UserMenu({ session, loginHref }: Props) {
  const [tLanding, tCommon, tNav] = await Promise.all([
    getTranslations('landing'),
    getTranslations('common'),
    getTranslations('nav'),
  ])

  if (!session) {
    return (
      <a
        href={loginHref}
        className="flex items-center gap-1.5 bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs sm:text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
      >
        <LogIn size={13} />
        {tLanding('discordLogin')}
      </a>
    )
  }

  const url = avatarUrl(session.discordId, session.avatar)

  return (
    <div className="flex items-center gap-2">
      {session.isMember && (
        <Link
          href="/me"
          className="flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <Wallet size={13} />
          {tNav('myWallet')}
        </Link>
      )}
      <Link
        href="/me"
        className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 hover:border-amber-500/60 rounded-full pl-0.5 pr-2.5 py-0.5 transition-colors"
        aria-label={tCommon('myPage')}
      >
        {url ? (
          // Using a plain <img> avoids registering discord CDN in next.config remotePatterns.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="w-6 h-6 rounded-full" />
        ) : (
          <UserCircle2 size={22} className="text-gray-400" />
        )}
        <span className="text-gray-200 text-xs font-medium max-w-[100px] truncate">
          {session.username}
        </span>
      </Link>
      <form action="/api/auth/logout" method="post">
        <button
          type="submit"
          className="flex items-center gap-1 text-gray-500 hover:text-red-400 text-xs transition-colors"
          aria-label={tCommon('logout')}
        >
          <LogOut size={13} />
        </button>
      </form>
    </div>
  )
}
