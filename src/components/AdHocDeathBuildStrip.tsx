'use client'

import { useTranslations } from 'next-intl'
import { SLOT_KEYS, type BuildSnapshot, type SlotKey } from '@/types'
import ItemImage from './ItemImage'

interface Props {
  snapshot: BuildSnapshot
}

// 트래킹 사망 카드용 읽기전용 장비 strip. RegearReviewList 의 BuildSnapshotStrip
// 과 모양은 비슷하지만 role 배지/제목이 없고, 그냥 부위별 아이콘만 한 줄로.
export default function AdHocDeathBuildStrip({ snapshot }: Props) {
  const tGear = useTranslations('gear')
  return (
    <div className="flex items-center gap-1.5 flex-wrap border-t border-gray-800 pt-2.5">
      {SLOT_KEYS.map((key: SlotKey) => {
        const item = snapshot[key]
        if (!item) return null
        return (
          <div key={key} className="flex flex-col items-center" title={tGear(key)}>
            <ItemImage itemId={item.id} itemName={item.name} size={32} hoverPreview />
          </div>
        )
      })}
    </div>
  )
}
