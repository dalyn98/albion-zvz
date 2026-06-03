import { getTranslations } from 'next-intl/server'
import NewEventDraftForm from '@/components/NewEventDraftForm'
import NewEventFromTemplateForm from '@/components/NewEventFromTemplateForm'
import DuplicateEventButton from '@/components/DuplicateEventButton'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getCreatableEventCategories } from '@/lib/event-permissions'
import type { EventCategory } from '@/types'
import { listTemplates } from '@/app/actions/templates'

interface RecentEvent {
  id: string
  title: string
  gather_at: string | null
  gather_time: string | null
  status: 'draft' | 'published'
}

async function listRecentEvents(guildId: string): Promise<RecentEvent[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('events')
    .select('id, title, gather_at, gather_time, status')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(5)
  return (data ?? []) as RecentEvent[]
}

export default async function NewEventPage() {
  const t = await getTranslations('adminNewEvent')
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const allowedCategories: EventCategory[] = getCreatableEventCategories(session)
  if (allowedCategories.length === 0) throw new Error('Unauthorized')
  const [recentEvents, templateResult] = await Promise.all([
    listRecentEvents(guildId),
    listTemplates(),
  ])
  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">{t('title')}</h1>
      <p className="text-gray-400 text-sm">{t('subtitle')}</p>
      <NewEventDraftForm
        allowedCategories={allowedCategories}
        canManageRegearPolicy={session.isAdmin}
      />
      {allowedCategories.length > 0 && (
        <NewEventFromTemplateForm
          templates={templateResult.templates}
          allowedCategories={allowedCategories}
        />
      )}
      <RecentEventClonePanel
        events={recentEvents}
        labels={{
          title: t('recentStartTitle'),
          description: t('recentStartDescription'),
          noSchedule: t('recentStartNoSchedule'),
          draft: t('recentStartDraft'),
          published: t('recentStartPublished'),
        }}
      />
    </div>
  )
}

function RecentEventClonePanel({
  events,
  labels,
}: {
  events: RecentEvent[]
  labels: {
    title: string
    description: string
    noSchedule: string
    draft: string
    published: string
  }
}) {
  if (events.length === 0) return null
  return (
    <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
      <div>
        <h2 className="font-bold text-white">{labels.title}</h2>
        <p className="text-gray-400 text-xs mt-1">{labels.description}</p>
      </div>
      <ul className="space-y-2">
        {events.map((event) => (
          <li
            key={event.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{event.title}</p>
              <p className="text-xs text-gray-500 truncate">
                {event.gather_time || event.gather_at || labels.noSchedule}
                {' · '}
                {event.status === 'draft' ? labels.draft : labels.published}
              </p>
            </div>
            <DuplicateEventButton eventId={event.id} />
          </li>
        ))}
      </ul>
    </section>
  )
}
