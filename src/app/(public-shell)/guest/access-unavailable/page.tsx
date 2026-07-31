import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

export default async function GuestAccessUnavailablePage() {
  const t = await getTranslations('eventGuestManagement')
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center px-4 py-12">
      <section className="w-full rounded-2xl border border-gray-800 bg-gray-950/80 p-6 text-center shadow-xl sm:p-8">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300">
          <ShieldAlert size={24} aria-hidden="true" />
        </div>
        <h1 className="text-xl font-bold text-white">{t('unavailableTitle')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-400">
          {t('unavailableDescription')}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex rounded-lg border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition-colors hover:border-amber-500/50 hover:text-amber-200"
        >
          {t('backHome')}
        </Link>
      </section>
    </main>
  )
}
