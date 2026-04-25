'use client'

import { useTranslations } from 'next-intl'
import EventCreatorRolesSetting from './EventCreatorRolesSetting'
import SettingsGroup from './SettingsGroup'

interface Props {
  legacyRoleIds: string[]
  combatRoleIds: string[]
  ffRoleIds: string[]
  gankingRoleIds: string[]
}

// 이벤트 생성 권한 4개 (전체/전투/FF/갱킹) 를 한 카드로 묶는 그룹.
// 내부 구성:
//   - 전체 (legacy event_creator_role_ids) — 모든 카테고리에 권한 부여
//   - 전투 / FF / 갱킹 — 각 카테고리에만 권한 부여
//
// 자식은 모두 embedded 모드라 자체 카드/리로그인 안내를 그리지 않고,
// SettingsGroup 이 위에서 한 번만 보여준다.
export default function EventCreatorRolesGroup({
  legacyRoleIds,
  combatRoleIds,
  ffRoleIds,
  gankingRoleIds,
}: Props) {
  const t = useTranslations('adminEventCreatorRolesGroup')
  const tLegacy = useTranslations('adminEventCreatorRoles')
  const tCategory = useTranslations('adminEventCreatorCategoryRoles')

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
    </SettingsGroup>
  )
}
