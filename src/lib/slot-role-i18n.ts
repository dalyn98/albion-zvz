// SlotRole enum(내부 키) → messages/{locale}.json 의 slotRole.* 키 매핑.
// slot.role_name 은 DB 에 SlotRole enum 값으로 저장되므로 렌더 시점에만 번역한다.

const ROLE_I18N_KEYS: Record<string, string> = {
  Caller: 'caller',
  OffTanker: 'offtank',
  DefTanker: 'deftank',
  Sup: 'support',
  Healer: 'healer',
  Dps: 'dps',
  EngageDps: 'engageDps',
  BrawlerDps: 'brawlerDps',
  BM: 'battlemount',
  '기타': 'other',
}

export function translateSlotRole(role: string, t: (key: string) => string): string {
  const key = ROLE_I18N_KEYS[role]
  return key ? t(key) : role
}
