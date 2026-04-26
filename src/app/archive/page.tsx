import { getAdminClient } from '@/lib/supabase-admin'
import type { Event } from '@/types'
import { getTranslations } from 'next-intl/server'
import { Archive } from 'lucide-react'
import { formatGatherTimeFor, isEnded } from '@/lib/gather-time'
import { formatDateTime } from '@/lib/format-datetime'
import { getLocale } from '@/lib/locale'
import { getSession } from '@/lib/session'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone'
import ArchiveEventList, { type ArchivedEventCard } from '@/components/ArchiveEventList'

export const dynamic = 'force-dynamic'

async function getArchivedEvents(guildId: string, tz: string): Promise<ArchivedEventCard[]> {
  const db = getAdminClient()
  const { data: events } = await db
    .from('events')
    .select('*')
    .eq('guild_id', guildId)
    .not('battle_started_at', 'is', null)
    .order('battle_started_at', { ascending: false })

  const ended = ((events ?? []) as Event[]).filter((e) =>
    e.battle_started_at ? isEnded(e.battle_started_at) : false,
  )
  if (ended.length === 0) return []

  const ids = ended.map((e) => e.id)
  const { data: parties } = await db
    .from('parties')
    .select('event_id, slots(id, assigned_discord_id, is_hidden)')
    .eq('guild_id', guildId)
    .in('event_id', ids)

  const totals = new Map<string, { total: number; assigned: number }>()
  for (const p of (parties ?? []) as {
    event_id: string
    slots: { id: string; assigned_discord_id: string | null; is_hidden: boolean }[] | null
  }[]) {
    const current = totals.get(p.event_id) ?? { total: 0, assigned: 0 }
    const slots = (p.slots ?? []).filter((s) => !s.is_hidden)
    current.total += slots.length
    current.assigned += slots.filter((s) => s.assigned_discord_id).length
    totals.set(p.event_id, current)
  }

  const locale = await getLocale()
  return ended.map((e) => {
    const t = totals.get(e.id) ?? { total: 0, assigned: 0 }
    return {
      id: e.id,
      title: e.title,
      gather_location: e.gather_location,
      gatherDisplay: e.gather_at ? formatGatherTimeFor(locale, e.gather_at, tz) : e.gather_time,
      battleStartedAt: e.battle_started_at,
      battleStartedDisplay: e.battle_started_at ? formatDateTime(e.battle_started_at, tz) : null,
      total: t.total,
      assigned: t.assigned,
      searchDate: e.battle_started_at ?? e.gather_at,
    }
  })
}

export default async function ArchivePage() {
  const session = await getSession()
  const guildId = session ? await getSessionGuildId(session) : await getPrimaryTenantId()
  const tz = await getTenantTimezone(guildId)
  const [t, events] = await Promise.all([
    getTranslations('archive'),
    getArchivedEvents(guildId, tz),
  ])
  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-6">
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Archive size={22} className="text-gray-400" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('title')}</h1>
        </div>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </header>
      <ArchiveEventList events={events} />
    </main>
  )
}
