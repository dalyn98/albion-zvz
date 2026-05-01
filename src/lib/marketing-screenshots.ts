// 마케팅 페이지(`/landing`, `/features`)의 스크린샷 슬롯 → 파일 경로 매핑.
//
// 스크린샷을 새로 추가하거나 교체하려면:
//   1. PNG/JPG 를 `/public/screenshots/<slot>.png` 에 저장한다.
//      (권장 사양: 16:9, 1920x1080 — 사이트가 어두운 배경이라 다크모드 캡쳐가 자연스럽다)
//   2. 아래의 해당 슬롯 값을 `null` → `'/screenshots/<slot>.png'` 으로 바꾼다.
//   3. 저장하면 ScreenshotPlaceholder 가 점선 placeholder → 실제 이미지로 자동 전환된다.
//
// 슬롯을 비워 두면(null) 점선 + 라벨 박스로 자리만 잡혀 있어 길드원이 봐도 어색하지 않다.

export type MarketingScreenshotKey = 'events' | 'regear' | 'craft' | 'shop' | 'stats'

export const MARKETING_SCREENSHOTS: Record<MarketingScreenshotKey, string | null> = {
  events: null, // /public/screenshots/events.png
  regear: null, // /public/screenshots/regear.png
  craft: null,  // /public/screenshots/craft.png
  shop: null,   // /public/screenshots/shop.png
  stats: null,  // /public/screenshots/stats.png
}
