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
