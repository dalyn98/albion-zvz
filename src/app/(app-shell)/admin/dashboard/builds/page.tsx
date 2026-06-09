import { getTranslations } from 'next-intl/server'
import { listSlotTemplateCards } from '@/app/actions/slot-templates'
import BuildTemplateList from '@/components/BuildTemplateList'
import CreateBuildTemplateButton from '@/components/CreateBuildTemplateButton'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'

export const dynamic = 'force-dynamic'

export default async function BuildTemplatesPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [{ templates, error }, t, tenantTimezone] = await Promise.all([
    listSlotTemplateCards(),
    getTranslations('adminBuildTemplates'),
    getTenantTimezone(guildId),
  ])

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{t('pageTitle')}</h1>
          <p className="text-gray-400 text-sm max-w-3xl">{t('pageDescription')}</p>
        </div>
        <CreateBuildTemplateButton />
      </div>

      {error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      ) : (
        <BuildTemplateList templates={templates} timezone={tenantTimezone} />
      )}
    </div>
  )
}
