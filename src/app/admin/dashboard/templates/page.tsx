import { getTranslations } from 'next-intl/server'
import { listTemplates } from '@/app/actions/templates'
import TemplateList from '@/components/TemplateList'

export const dynamic = 'force-dynamic'

export default async function TemplatesPage() {
  const [{ templates, error }, t] = await Promise.all([
    listTemplates(),
    getTranslations('adminTemplates'),
  ])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <p className="text-gray-400 text-xs sm:text-sm mt-1">
          {t('pageDescription')}
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {templates.length === 0 && !error ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          {t('noTemplates')}
        </p>
      ) : (
        <TemplateList templates={templates} />
      )}
    </div>
  )
}
