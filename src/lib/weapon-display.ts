// Albion 한글 로컬라이즈 이름은 T8 아이템의 경우 `장로의 ~`로 시작한다.
// 길드 ZvZ는 거의 T8만 쓰다 보니 리스트 상에서 접두사가 반복되어 시각적 노이즈가
// 크다. 화면에 보여줄 때만 접두사를 제거하고, 저장값(id)은 그대로 유지한다.
const DISPLAY_STRIPPABLE_PREFIXES = ['장로의 '] as const

export function stripTierPrefix(name: string | null | undefined): string {
  if (!name) return ''
  for (const prefix of DISPLAY_STRIPPABLE_PREFIXES) {
    if (name.startsWith(prefix)) return name.slice(prefix.length)
  }
  return name
}

// 무기 사용 통계처럼 "같은 무기군" 을 하나로 묶어 보여줘야 하는 뷰에서 사용.
// 관찰된 킬보드 샘플은 `T6_MAIN_HOLYSTAFF_AVALON@1` 처럼 티어/인챈트가 뒤섞여
// 있고, 인챈트 변종은 items 번들에 별도 엔트리가 없어 getLocalizedItemName 이
// null 을 돌려주기 쉽다. 이 함수는 T8.0 base 형태로 정규화해서 로컬라이즈를
// 보장하고, 유저가 기대하는 "장로의 ~" 표기로 수렴시킨다.
export function canonicalT8WeaponId(
  weaponId: string | null | undefined,
): string | null {
  if (!weaponId) return null
  const withoutEnchant = weaponId.split('@')[0]
  const match = withoutEnchant.match(/^T\d+_(2H|MAIN)_(.+)$/)
  if (!match) return null
  return `T8_${match[1]}_${match[2]}`
}
