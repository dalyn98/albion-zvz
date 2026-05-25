import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getTemplate } from '@/app/actions/templates'
import TemplateEditor from '@/components/TemplateEditor'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function TemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [{ template, error }, t, tenantTimezone] = await Promise.all([
    getTemplate(id),
    getTranslations('adminTemplates'),
    getTenantTimezone(guildId),
  ])

  if (error || !template) notFound()

  return (
    <div className="space-y-4">
      <Link
        href="/admin/dashboard?section=templates"
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm"
      >
        <ChevronLeft size={14} /> {t('backToList')}
      </Link>
      <h1 className="text-xl sm:text-2xl font-bold text-white">{t('editTitle')}</h1>
      <TemplateEditor template={template} timezone={tenantTimezone} />
    </div>
  )
}
