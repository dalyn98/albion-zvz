import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getMyRegearDetail } from '@/app/actions/regear'
import MyRegearBreakdownEditor from '@/components/MyRegearBreakdownEditor'

export const dynamic = 'force-dynamic'

export default async function MyRegearDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/api/auth/discord/start?returnTo=/me/regear/${id}`)
  }
  if (!session.isMember) redirect('/')

  const { detail, error } = await getMyRegearDetail(id)
  if (error || !detail) notFound()

  const t = await getTranslations('common')

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-4">
      <Link
        href="/me"
        className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200"
      >
        <ArrowLeft size={14} />
        {t('backToMyPage')}
      </Link>
      <MyRegearBreakdownEditor detail={detail} />
    </main>
  )
}
