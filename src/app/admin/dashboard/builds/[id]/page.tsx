import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSlotTemplate } from '@/app/actions/slot-templates'
import BuildTemplateEditor from '@/components/BuildTemplateEditor'

export const dynamic = 'force-dynamic'

export default async function BuildTemplateEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ template, error }, t] = await Promise.all([
    getSlotTemplate(id),
    getTranslations('adminBuildTemplates'),
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
      <BuildTemplateEditor template={template} />
    </div>
  )
}
