import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSlotTemplate } from '@/app/actions/slot-templates'
import BuildTemplateEditor from '@/components/BuildTemplateEditor'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function BuildTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [{ template, error }, t, tenantTimezone] = await Promise.all([
    getSlotTemplate(id),
    getTranslations('adminBuildTemplates'),
    getTenantTimezone(guildId),
  ])

  if (error || !template) notFound()

  return (
    <div className="space-y-4">
      <Link
        href="/admin/dashboard/builds"
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm"
      >
        <ChevronLeft size={14} /> {t('backToList')}
      </Link>
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('editTitle')}</h1>
        <p className="text-gray-400 text-sm">{t('editDescription')}</p>
      </div>
      <BuildTemplateEditor template={template} timezone={tenantTimezone} />
    </div>
  )
}
