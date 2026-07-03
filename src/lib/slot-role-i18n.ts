// SlotRole enum(내부 키) → 사용자에게 보이는 canonical English 라벨.
// 역할군 이름은 locale 에 따라 번역하지 않는다. DB 에 저장된 내부 키는 그대로 두고
// 렌더 시점에 사람이 읽는 고정 영어 라벨만 입힌다.

const SLOT_ROLE_LABELS: Record<string, string> = {
  Caller: 'Caller',
  OffTanker: 'Offense Tanker',
  DefTanker: 'Defense Tanker',
  Sup: 'Support',
  Healer: 'Healer',
  Dps: 'Engage DPS',
  EngageDps: 'Engage DPS',
  BrawlerDps: 'Engage DPS',
  BM: 'Battle Mount',
  '기타': 'Other',
}

export function translateSlotRole(role: string, t?: (key: string) => string): string {
  void t
  return SLOT_ROLE_LABELS[role] ?? role
}
