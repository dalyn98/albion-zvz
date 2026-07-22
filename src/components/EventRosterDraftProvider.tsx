'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PartyWithSlots } from '@/types'
import {
  mergeEventPartyDrafts,
  type EventPartyDraft,
} from '@/lib/event-roster-draft'

type ReportDraft = (draft: EventPartyDraft) => void
type ClearDraft = (partyNumber: number) => void

const EventRosterDraftReporterContext = createContext<{
  reportDraft: ReportDraft
  clearDraft: ClearDraft
} | null>(null)
const EventRosterDraftPartiesContext = createContext<readonly PartyWithSlots[] | null>(null)

interface Props {
  eventId: string
  initialParties: PartyWithSlots[]
  children: ReactNode
}

export default function EventRosterDraftProvider({
  eventId,
  initialParties,
  children,
}: Props) {
  const [drafts, setDrafts] = useState<Record<number, EventPartyDraft>>({})

  const reportDraft = useCallback<ReportDraft>((draft) => {
    setDrafts((current) => {
      if (current[draft.partyNumber] === draft) return current
      return { ...current, [draft.partyNumber]: draft }
    })
  }, [])
  const clearDraft = useCallback<ClearDraft>((partyNumber) => {
    setDrafts((current) => {
      if (!current[partyNumber]) return current
      return Object.fromEntries(
        Object.entries(current).filter(([key]) => Number(key) !== partyNumber),
      )
    })
  }, [])

  const liveParties = useMemo(
    () => mergeEventPartyDrafts(initialParties, Object.values(drafts), eventId),
    [drafts, eventId, initialParties],
  )
  const reporter = useMemo(
    () => ({ reportDraft, clearDraft }),
    [clearDraft, reportDraft],
  )

  return (
    <EventRosterDraftReporterContext.Provider value={reporter}>
      <EventRosterDraftPartiesContext.Provider value={liveParties}>
        {children}
      </EventRosterDraftPartiesContext.Provider>
    </EventRosterDraftReporterContext.Provider>
  )
}

export function useReportEventPartyDraft(draft: EventPartyDraft): void {
  const reporter = useContext(EventRosterDraftReporterContext)

  useEffect(() => {
    reporter?.reportDraft(draft)
  }, [draft, reporter])

  useEffect(() => {
    if (!reporter) return
    return () => reporter.clearDraft(draft.partyNumber)
  }, [draft.partyNumber, reporter])
}

export function useEventRosterDraftParties(
  fallback: readonly PartyWithSlots[],
): readonly PartyWithSlots[] {
  return useContext(EventRosterDraftPartiesContext) ?? fallback
}
