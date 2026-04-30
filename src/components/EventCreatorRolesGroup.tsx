'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import EventCreatorRolesSetting from './EventCreatorRolesSetting'
import SettingsGroup from './SettingsGroup'

interface Props {
  legacyRoleIds: string[]
  combatRoleIds: string[]
  ffRoleIds: string[]
  gankingRoleIds: string[]
}

// 이벤트 생성 권한을 한 카드로 묶는 그룹.
// 시각 단순화: legacy "전체" 셀렉터는 항상 노출, 카테고리별 (전투/FF/갱킹) 위임은
// 기본 접힌 disclosure 안에 둔다. 카테고리 중 하나라도 값이 있으면 자동 펼침 —
// 운영 중인 길드는 본인 설정을 즉시 보고, 신규 길드는 카드 1개로만 의식.
export default function EventCreatorRolesGroup({
  legacyRoleIds,
  combatRoleIds,
  ffRoleIds,
  gankingRoleIds,
}: Props) {
  const t = useTranslations('adminEventCreatorRolesGroup')
  const tLegacy = useTranslations('adminEventCreatorRoles')
  const tCategory = useTranslations('adminEventCreatorCategoryRoles')

  const hasCategoryValue =
    combatRoleIds.length > 0 || ffRoleIds.length > 0 || gankingRoleIds.length > 0
  const [expanded, setExpanded] = useState(hasCategoryValue)

  return (
    <SettingsGroup
      title={t('title')}
      description={t('description')}
      hint={tLegacy('reloginHint')}
    >
      <EventCreatorRolesSetting
        initialRoleIds={legacyRoleIds}
        settingKey="event_creator_role_ids"
        embedded
        titleOverride={t('legacyTitle')}
        descriptionOverride={t('legacyDescription')}
      />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-amber-300 transition-colors w-fit"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {t('categoryDisclosureLabel')}
      </button>
      {expanded && (
        <div className="space-y-3 pl-2 border-l border-gray-800">
          <EventCreatorRolesSetting
            initialRoleIds={combatRoleIds}
            settingKey="event_creator_role_ids_combat"
            embedded
            titleOverride={tCategory('combatTitle')}
            descriptionOverride={tCategory('combatDescription')}
          />
          <EventCreatorRolesSetting
            initialRoleIds={ffRoleIds}
            settingKey="event_creator_role_ids_ff"
            embedded
            titleOverride={tCategory('ffTitle')}
            descriptionOverride={tCategory('ffDescription')}
          />
          <EventCreatorRolesSetting
            initialRoleIds={gankingRoleIds}
            settingKey="event_creator_role_ids_ganking"
            embedded
            titleOverride={tCategory('gankingTitle')}
            descriptionOverride={tCategory('gankingDescription')}
          />
        </div>
      )}
    </SettingsGroup>
  )
}
