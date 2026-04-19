import { getTranslations } from 'next-intl/server'
import EventInfoForm from '@/components/EventInfoForm'

export default async function NewEventPage() {
  const t = await getTranslations('adminNewEvent')
  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
      <p className="text-gray-400 text-sm">{t('subtitle')}</p>
      <EventInfoForm />
    </div>
  )
}
