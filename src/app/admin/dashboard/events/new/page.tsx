import { getTranslations } from 'next-intl/server'
import NewEventDraftForm from '@/components/NewEventDraftForm'
import { getSession } from '@/lib/session'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'

export default async function NewEventPage() {
  const t = await getTranslations('adminNewEvent')
  const session = await getSession()
  const allowedCategories: EventCategory[] = session?.isAdmin
    ? [...EVENT_CATEGORIES]
    : session?.eventCreatorCategories ?? []
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
      <p className="text-gray-400 text-sm">{t('subtitle')}</p>
      <NewEventDraftForm allowedCategories={allowedCategories} />
    </div>
  )
}
