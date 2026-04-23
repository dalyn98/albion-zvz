'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import PartyEditorPanel from './PartyEditorPanel'
import {
  CATEGORY_PARTY_LIMITS,
  type EventCategory,
  type PartyWithSlots,
} from '@/types'

interface MemberDirectoryEntry {
  discord_id: string
  username: string
  eligible: boolean
}

interface Props {
  eventId: string
  parties: PartyWithSlots[]
  memberDirectory: MemberDirectoryEntry[]
  autoRegearEnabled: boolean
  eventCategory: EventCategory
}

// 카테고리별 파티 수 제한을 반영해 PartyEditorPanel 목록을 렌더하는 클라이언트
// 래퍼. 서버 컴포넌트 페이지에서는 파티 렌더 개수를 동적으로 조절할 수 없어
// 분리. 기존 파티 번호가 기본값을 넘더라도 무시되지 않도록 최대 카테고리 상한
// 안에서 기존 번호를 전부 커버한다.
export default function PartyListEditor({
  eventId,
  parties,
  memberDirectory,
  autoRegearEnabled,
  eventCategory,
}: Props) {
  const t = useTranslations('adminEditEvent')
  const limits = CATEGORY_PARTY_LIMITS[eventCategory]
  const highestExisting = parties.reduce(
    (max, p) => (p.party_number > max ? p.party_number : max),
    0,
  )
  const initialCount = Math.min(limits.max, Math.max(limits.default, highestExisting))
  const [renderCount, setRenderCount] = useState<number>(initialCount)
  const partiesByNumber = new Map(parties.map((p) => [p.party_number, p]))

  const addParty = () => {
    setRenderCount((n) => Math.min(limits.max, n + 1))
  }

  const partyNumbers = Array.from({ length: renderCount }, (_, i) => i + 1)

  return (
    <div className="space-y-3">
      {partyNumbers.map((partyNumber) => {
        const party = partiesByNumber.get(partyNumber) ?? null
        return (
          <PartyEditorPanel
            key={`${partyNumber}-${party?.id ?? 'empty'}`}
            eventId={eventId}
            partyNumber={partyNumber}
            initialData={party}
            memberDirectory={memberDirectory}
            autoRegearEnabled={autoRegearEnabled}
            eventCategory={eventCategory}
          />
        )
      })}
      {renderCount < limits.max && (
        <div className="pt-1">
          <button
            type="button"
            onClick={addParty}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-300 text-sm font-medium"
          >
            <Plus size={14} /> {t('addParty')}
          </button>
        </div>
      )}
    </div>
  )
}
