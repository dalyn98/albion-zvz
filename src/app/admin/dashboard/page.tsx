import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'
import Link from 'next/link'
import { Plus, Calendar } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import DashboardEventList from '@/components/DashboardEventList'

// Never prerender at build — the event list must reflect the current DB. A
// static snapshot would ship links to already-deleted events, producing 404s.
export const dynamic = 'force-dynamic'

async function getEvents(): Promise<Event[]> {
  const { data } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}

export default async function DashboardPage() {
  const [events, t] = await Promise.all([getEvents(), getTranslations('adminDashboard')])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
        <Link
          href="/admin/dashboard/events/new"
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Plus size={16} />
          {t('newEvent')}
        </Link>
      </div>

      {events.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-12 text-center">
          <Calendar size={32} className="text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400">{t('noEvents')}</p>
          <Link href="/admin/dashboard/events/new" className="text-amber-400 hover:text-amber-300 text-sm mt-2 inline-block">
            {t('createFirstEvent')}
          </Link>
        </div>
      ) : (
        <DashboardEventList events={events} />
      )}
    </div>
  )
}
