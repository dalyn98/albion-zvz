// User-Agent 기반 인앱 브라우저 감지. 서버 (callback/finish 에서 telemetry 용)
// 와 클라이언트 (AppGate 에서 외부 브라우저 안내 UI) 양쪽에서 동일 로직을 쓰기
// 위해 순수 함수로 분리. UA 는 모든 인앱 브라우저가 일관된 토큰을 박지 않아
// 보수적으로 잡되, false negative (감지 못함) 가 false positive (멀쩡한 브라우저를
// 인앱으로 오인) 보다는 낫다.

export type InAppBrowserKind =
  | 'kakaotalk'
  | 'discord'
  | 'instagram'
  | 'facebook'
  | 'line'
  | 'naver'
  | 'wechat'
  | 'unknown_webview'
  | null

export function detectInAppBrowser(userAgent: string | null | undefined): InAppBrowserKind {
  if (!userAgent) return null
  const ua = userAgent
  if (/KAKAOTALK/i.test(ua)) return 'kakaotalk'
  if (/\bDiscord\b/.test(ua) && !/Discordbot/i.test(ua)) return 'discord'
  if (/Instagram/i.test(ua)) return 'instagram'
  // FBAN = Facebook for iOS, FBAV = Facebook for Android, FB_IAB = in-app browser.
  if (/FBAN|FBAV|FB_IAB|FB4A/i.test(ua)) return 'facebook'
  if (/\bLine\//i.test(ua)) return 'line'
  if (/NAVER\(inapp/i.test(ua)) return 'naver'
  if (/MicroMessenger/i.test(ua)) return 'wechat'
  // iOS WKWebView 일반 패턴 — Safari 토큰이 없고 Mobile/...AppleWebKit 만 있으면
  // 인앱 가능성. desktop Safari 도 Safari 토큰을 박으므로 모바일 한정 + 알려진
  // 인앱 토큰이 없을 때만 fallback.
  const isIOSWebView =
    /iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua)
  if (isIOSWebView) return 'unknown_webview'
  return null
}
