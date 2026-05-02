// 공개 surface (`/g/<slug>`, `/docs` 의 "내 길드" 배너 등) 에 노출할 길드 표시
// 이름 결정 로직. 알비온 길드명은 인게임 제약상 영어 — albion_home_guild_name
// (어드민 위저드 입력) 이 1순위. 미설정 시 slug 파생, 마지막 폴백으로 Discord
// 길드명 (한국어/일본어 가능) 을 쓴다. 같은 invariant 가 페이지/마케팅/메타에
// 두루 필요해 라이브러리로 빼둔다.

import { getAppSetting } from '@/lib/app-settings'
import { displayNameFromSlug } from '@/lib/tenant-slug'

export async function resolveAlbionDisplayName(
  tenantId: string,
  slug: string,
  fallback: string,
): Promise<string> {
  const albionName = (await getAppSetting('albion_home_guild_name', '', tenantId)).trim()
  if (albionName) return albionName
  const derived = displayNameFromSlug(slug)
  if (derived) return derived
  return fallback
}
