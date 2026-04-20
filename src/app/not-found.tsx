import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Compass, Home } from 'lucide-react'

export default async function NotFound() {
  const t = await getTranslations('errors')
  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-gray-900 border border-gray-700 rounded-2xl p-6 space-y-4 text-center">
        <div className="flex justify-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center">
            <Compass size={24} className="text-amber-300" />
          </div>
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-white">{t('notFoundTitle')}</h1>
          <p className="text-sm text-gray-400">{t('notFoundDescription')}</p>
        </div>
        <div className="flex justify-center pt-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-sm font-semibold px-3 py-2 rounded-lg transition-colors"
          >
            <Home size={14} />
            {t('home')}
          </Link>
        </div>
      </div>
    </main>
  )
}
