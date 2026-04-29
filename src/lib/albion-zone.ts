// Albion Online cluster_name 기반 Royal Continent 추정.
//
// AGENTS.md hard rule #5: 자동 리기어는 "블랙존 한정" 으로만 작동해야 한다.
// 그런데 Albion gameinfo API 는 cluster_name 만 줄 뿐 zone tier (Black/Royal Red/
// Royal Yellow/Royal Blue) 를 직접 노출하지 않아, 우리가 cluster_name 패턴 매칭으로
// best-effort 분류한다. 완전한 mapping 은 어렵지만 "도시 광장 PvP", "이름 있는 Royal
// 도시 변두리" 같은 명백한 오용은 막을 수 있다.
//
// 정책: cluster_name 에 6대 Royal 도시명 또는 도시 외곽/Brecilien 키워드가
// 포함되면 Royal 로 판정 → 자동 리기어 차단. NULL 이거나 그 외엔 통과 — 자동
// 리기어 매칭이 already 통과한 (low-engagement cut + tracked battle) 후 단계라
// 거기서 걸러진 케이스는 거의 다 Outlands/Avalon road 라고 봐도 안전.
//
// 운영자가 본인 길드에서 실수로 Royal Red zone faction warfare 등을 자동 청구
// 받는 일은 거의 없지만, self-serve 길드 (관리자가 다른 사람) 가 misconfigure
// 했을 때를 대비한 코드 가드.

const ROYAL_KEYWORDS = [
  // 6대 Royal 도시
  'caerleon',
  'lymhurst',
  'bridgewatch',
  'martlock',
  'fort sterling',
  'thetford',
  // Royal 도시 변두리 (PvP 거의 무의미)
  'outskirts',
  // Hidden city — Royal 영역에서 진입
  'brecilien',
  // 손실 없는 매치 모드
  'crystal league',
  'arena',
] as const

// cluster_name 이 Royal Continent 또는 손실 없는 모드를 강하게 시사하는지 판정.
// 대소문자 무시, 공백/하이픈 차이도 흡수하기 위해 lowercase substring match.
// 매칭되면 true → 자동 리기어 처리 대상에서 제외해야 한다.
export function isLikelyRoyalCluster(clusterName: string | null | undefined): boolean {
  if (!clusterName) return false
  const lower = clusterName.toLowerCase()
  return ROYAL_KEYWORDS.some((kw) => lower.includes(kw))
}
