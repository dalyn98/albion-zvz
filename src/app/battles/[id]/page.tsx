import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getBattleDetail } from '@/app/actions/battles'
import BattleDetailView from '@/components/BattleDetailView'

export const dynamic = 'force-dynamic'

interface SearchParams {
  perspective?: string
}

export default async function BattleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<SearchParams>
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams])

  const session = await getSession()
  if (!session) {
    const returnTo = sp.perspective
      ? `/battles/${id}?perspective=${encodeURIComponent(sp.perspective)}`
      : `/battles/${id}`
    redirect(`/api/auth/discord/start?returnTo=${encodeURIComponent(returnTo)}`)
  }

  const [{ detail, error }, t] = await Promise.all([
    getBattleDetail(id, sp.perspective),
    getTranslations('battleDetail'),
  ])
  if (!detail && !error) notFound()

  // 자기 시점일 때만 base url 로 돌아가는 링크. cross 보기 시엔 self 로 돌아가는
  // 링크가 더 의미 있으므로 ArrowLeft 가 perspective 를 떼고 같은 id 로 향한다.
  const backHref =
    detail?.perspectiveKind === 'cross' ? `/battles/${id}` : '/battles'
  const backLabel = detail?.perspectiveKind === 'cross' ? t('backToSelf') : t('backToList')

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-xs"
      >
        <ArrowLeft size={13} />
        {backLabel}
      </Link>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {detail && <BattleDetailView detail={detail} battleId={id} />}
    </main>
  )
}
