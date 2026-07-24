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
  | 'google'
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
  // Google iOS 앱은 내장 브라우저 UA에 GSA/<version> 토큰을 추가한다.
  // Safari 토큰도 함께 포함할 수 있어 일반 WKWebView fallback보다 먼저 검사한다.
  if (/\bGSA\//i.test(ua)) return 'google'
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

export type MobilePlatform = 'ios' | 'android' | null

export function detectMobilePlatform(userAgent: string | null | undefined): MobilePlatform {
  if (!userAgent) return null
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  return null
}

// 인앱 브라우저에서 외부 브라우저로 강제 진입시키는 URL 을 생성.
//   - iOS: x-safari-https:// 커스텀 스킴 → Safari
//   - Android: intent:// + package=com.android.chrome → Chrome
//     S.browser_fallback_url 로 Chrome 미설치 시 폴백.
// 데스크탑/지원되지 않는 환경은 null (UI 가 버튼 자체를 숨김).
export function buildExternalBrowserHref(
  userAgent: string | null | undefined,
  url: string,
): string | null {
  if (!url) return null
  const platform = detectMobilePlatform(userAgent)
  if (platform === 'ios') {
    return url.replace(/^https:/, 'x-safari-https:')
  }
  if (platform === 'android') {
    // intent URL 형식: intent://HOST+PATH#Intent;scheme=https;package=...;end
    // 스킴 접두사를 떼고 호스트+경로만 intent:// 뒤에 붙인다.
    const stripped = url.replace(/^https?:\/\//, '')
    const fallback = encodeURIComponent(url)
    return `intent://${stripped}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`
  }
  return null
}
