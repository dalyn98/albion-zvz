import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import OnboardWizardProgress from '@/components/OnboardWizardProgress'

export const dynamic = 'force-dynamic'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

// 모든 온보딩 위저드 페이지 (/onboard/setup/[id]/*) 공통 레이아웃. 세션과 tenant
// 소유권을 한 곳에서 검증하고 상단에 공유 progress 인디케이터를 렌더한다. 각
// 페이지는 본인만의 form/콘텐츠에 집중한다.
export default async function OnboardSetupLayout({ children, params }: LayoutProps) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/api/auth/discord/start?returnTo=/onboard')

  const db = getAdminClient()
  const { data: tenant } = await db
    .from('tenants')
    .select('id, created_by_discord_id')
    .eq('id', id)
    .maybeSingle()
  if (!tenant || tenant.created_by_discord_id !== session.discordId) {
    redirect('/onboard')
  }

  const t = await getTranslations('onboard')

  return (
    <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-10 sm:py-14">
      <OnboardWizardProgress
        tenantId={id}
        stepOf={t('stepOf')}
        labels={[t('step1Label'), t('step2Label'), t('step3Label')]}
      />
      {children}
    </main>
  )
}
