import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import type { EventCategory, PartyWithSlots } from '@/types'
import { CATEGORY_PARTY_LIMITS } from '@/types'
import PartyEditorPanel from '@/components/PartyEditorPanel'
import { EventEditSaveProvider } from '@/components/EventEditSaveRegistry'
import EventEditSaveBar from '@/components/EventEditSaveBar'

export const dynamic = 'force-dynamic'

interface PageParams {
  id: string
  partyNumber: string
}

async function loadContext(eventId: string, partyNumber: number) {
  const admin = getAdminClient()
  const [{ data: event }, { data: partyRow }] = await Promise.all([
    admin.from('events').select('id, title, created_by, battle_started_at, status, category').eq('id', eventId).maybeSingle(),
    admin
      .from('parties')
      .select('*, slots(*)')
      .eq('event_id', eventId)
      .eq('party_number', partyNumber)
      .maybeSingle(),
  ])

  const party = partyRow
    ? ({
        ...partyRow,
        slots: [...(partyRow.slots ?? [])].sort(
          (a, b) => a.slot_number - b.slot_number,
        ),
      } as PartyWithSlots)
    : null

  return { event, party }
}

export default async function CallerPartyEditPage({
  params,
}: {
  params: Promise<PageParams>
}) {
  const { id: eventId, partyNumber: partyNumberRaw } = await params
  const partyNumber = Number(partyNumberRaw)
  // 카테고리별 상한은 event 로드 후 추가 검증 — 여기서는 어떤 카테고리에서도
  // 가능한 최대치만 거른다.
  const HARD_MAX_PARTIES = Math.max(...Object.values(CATEGORY_PARTY_LIMITS).map((l) => l.max))
  if (!Number.isInteger(partyNumber) || partyNumber < 1 || partyNumber > HARD_MAX_PARTIES) {
    notFound()
  }

  const [session, t, tEvent, autoRegearRaw] = await Promise.all([
    getSession(),
    getTranslations('adminEditEvent'),
    getTranslations('event'),
    getAppSetting('auto_regear_enabled', 'false'),
  ])
  if (!session) notFound()

  const { event, party } = await loadContext(eventId, partyNumber)
  if (!event || !party) notFound()

  const eventCategory = (event.category ?? '전투') as EventCategory
  const categoryMax = CATEGORY_PARTY_LIMITS[eventCategory]?.max ?? HARD_MAX_PARTIES
  if (partyNumber > categoryMax) notFound()

  const isOwner = !!event.created_by && event.created_by === session.discordId
  const isCaller =
    !!party.caller_discord_id && party.caller_discord_id === session.discordId
  const isAdminOrOwner = session.isAdmin || isOwner
  if (!isAdminOrOwner && !isCaller) notFound()

  // memberDirectory 는 PartyEditorPanel 의 caller dropdown 과 헤더 배지용.
  // 콜러 모드에서는 dropdown 이 숨겨지지만 배지를 위해 이름 하나는 필요해
  // 서 최소한 현재 caller 정보를 확보. admin 인 경우 전체 디렉토리까지 로드
  // 할 수도 있지만 이 페이지의 목적은 파티 단위 편집이므로 최소화.
  const admin = getAdminClient()
  const callerIdForLookup = party.caller_discord_id
  const { data: callerMember } = callerIdForLookup
    ? await admin
        .from('guild_avatars')
        .select('discord_id, username')
        .eq('discord_id', callerIdForLookup)
        .maybeSingle()
    : { data: null }

  const memberDirectory = callerMember
    ? [
        {
          discord_id: callerMember.discord_id as string,
          username: callerMember.username as string,
          eligible: true as const,
        },
      ]
    : []

  const autoRegearEnabled = autoRegearRaw === 'true'

  return (
    <EventEditSaveProvider>
      <div className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        <Link
          href={`/events/${eventId}`}
          className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft size={14} />
          {tEvent('backToList')}
        </Link>

        <header className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white">{event.title}</h1>
          <p className="text-gray-400 text-sm">{t('title')}</p>
        </header>

        <PartyEditorPanel
          eventId={eventId}
          partyNumber={partyNumber}
          initialData={party}
          memberDirectory={memberDirectory}
          autoRegearEnabled={autoRegearEnabled}
          eventCategory={eventCategory}
          isCallerScoped={!isAdminOrOwner}
          defaultOpen
        />

        <EventEditSaveBar
          eventId={eventId}
          eventStatus={event.status === 'draft' ? 'draft' : 'published'}
        />
      </div>
    </EventEditSaveProvider>
  )
}
