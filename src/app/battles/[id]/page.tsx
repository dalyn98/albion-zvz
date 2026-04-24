import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getBattleDetail } from '@/app/actions/battles'
import BattleDetailView from '@/components/BattleDetailView'

export const dynamic = 'force-dynamic'

export default async function BattleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getSession()
  if (!session) {
    redirect(`/api/auth/discord/start?returnTo=/battles/${id}`)
  }

  const [{ detail, error }, t] = await Promise.all([
    getBattleDetail(id),
    getTranslations('battleDetail'),
  ])
  if (!detail && !error) notFound()

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <Link
        href="/battles"
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs"
      >
        <ArrowLeft size={13} />
        {t('backToList')}
      </Link>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {detail && <BattleDetailView detail={detail} />}
    </main>
  )
}
