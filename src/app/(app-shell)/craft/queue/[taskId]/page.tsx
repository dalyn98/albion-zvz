import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Hammer } from 'lucide-react'
import { getSession } from '@/lib/session'
import {
  getMyCrafterProfile,
  getCraftConfig,
} from '@/app/actions/craft'
import { getCraftQueueTaskDetail } from '@/app/actions/craft-queue'
import CraftTaskDetail from '@/components/CraftTaskDetail'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'

// 단일 craft task 상세. 큐 카드의 "상세" 링크에서 진입. 권한 검사는 server
// action 안에서 isCrafter / isAdmin 체크로 처리.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ taskId: string }>
}

export default async function CraftQueueTaskDetailPage({ params }: PageProps) {
  const { taskId } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/craft/queue/${taskId}`)}`)
  }
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)
  const [{ detail, error }, profile, config, t, tRegear, timezone, support] = await Promise.all([
    getCraftQueueTaskDetail(taskId),
    getMyCrafterProfile(),
    getCraftConfig(),
    getTranslations('craftQueue'),
    getTranslations('regear'),
    getTenantTimezone(guildId),
    getRegearSupportConfiguration(guildId),
  ])
  const operational =
    support.supported && support.fulfillmentMode === 'crafted'

  if (!operational && !detail) {
    return (
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <Hammer size={28} className="text-gray-600 mx-auto" />
          <h1 className="text-base font-bold text-white">
            {support.supported ? t('disabledTitle') : tRegear('supportDisabledTitle')}
          </h1>
          <p className="text-gray-400 text-sm">
            {support.supported ? t('disabledHint') : tRegear('supportDisabledDescription')}
          </p>
        </div>
      </main>
    )
  }

  if (!detail) {
    if (error) {
      return (
        <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8">
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center space-y-2">
            <Hammer size={28} className="text-red-400 mx-auto" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        </main>
      )
    }
    notFound()
  }

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      {!operational && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-200">
            {support.supported ? t('disabledTitle') : tRegear('supportDisabledTitle')}
          </p>
          <p className="mt-1 text-xs text-amber-100/80">
            {support.supported ? t('disabledHint') : tRegear('supportDisabledDescription')}
          </p>
        </div>
      )}
      <CraftTaskDetail
        detail={detail}
        profile={profile}
        config={config}
        timezone={timezone}
        readOnly={!operational}
      />
    </main>
  )
}
