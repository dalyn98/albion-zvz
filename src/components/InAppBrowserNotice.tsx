'use client'

import { useState, useSyncExternalStore } from 'react'
import { ExternalLink, Copy, Check } from 'lucide-react'
import {
  buildExternalBrowserHref,
  detectInAppBrowser,
  type InAppBrowserKind,
} from '@/lib/user-agent'

// navigator.userAgent 는 페이지 lifetime 동안 바뀌지 않지만, hydration mismatch
// 를 피하려면 첫 서버 렌더링은 null 을 돌려줘야 한다. useSyncExternalStore 가
// "서버 snapshot = null / 클라이언트 snapshot = 실제 감지값" 분리 처리에 정확히
// 맞다. useEffect → setState 패턴은 React 19 의 set-state-in-effect 룰에 걸린다.
const NO_OP_SUBSCRIBE = () => () => {}

function getClientKind(): InAppBrowserKind {
  if (typeof navigator === 'undefined') return null
  return detectInAppBrowser(navigator.userAgent)
}

function getClientUrl(): string {
  if (typeof window === 'undefined') return ''
  return window.location.href
}

function getServerKind(): InAppBrowserKind {
  return null
}

function getServerUrl(): string {
  return ''
}

interface Props {
  title: string
  description: string
  copyButtonLabel: string
  copiedLabel: string
  openBrowserLabel: string
  perAppHint: Partial<Record<NonNullable<InAppBrowserKind>, string>>
}

// 인앱 브라우저 (카톡/디스코드/인스타/페북/라인 등) 에서 진입한 사용자에게
// Discord OAuth 가 깨지는 이유와 외부 브라우저로 여는 방법을 안내한다.
//
// 핵심 동작:
//   1. 클라이언트에서 navigator.userAgent 로 감지 (서버 UA 는 일부 인앱이
//      위변조해 신뢰도 낮음)
//   2. 감지되면 안내 카드 노출 + 현재 URL 복사 버튼
//   3. iOS Safari 만 'x-safari-https://' 스킴 fallback 제공 (가장 신뢰도 높은
//      외부 브라우저 강제 진입 방법)
export default function InAppBrowserNotice({
  title,
  description,
  copyButtonLabel,
  copiedLabel,
  openBrowserLabel,
  perAppHint,
}: Props) {
  const kind = useSyncExternalStore(NO_OP_SUBSCRIBE, getClientKind, getServerKind)
  const currentUrl = useSyncExternalStore(NO_OP_SUBSCRIBE, getClientUrl, getServerUrl)
  const [copied, setCopied] = useState(false)

  if (!kind) return null

  const externalBrowserHref =
    typeof navigator !== 'undefined'
      ? buildExternalBrowserHref(navigator.userAgent, currentUrl)
      : null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: textarea + execCommand 는 일부 인앱에서도 동작. 실패 시
      // 사용자가 URL 을 직접 길게 눌러 복사할 수 있도록 표시는 유지.
    }
  }

  const hint = perAppHint[kind]

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 backdrop-blur-sm p-4 text-left space-y-3">
      <div className="space-y-1">
        <p className="text-amber-200 font-semibold text-sm">{title}</p>
        <p className="text-amber-100/90 text-xs leading-relaxed">{description}</p>
        {hint && <p className="text-amber-100/80 text-xs leading-relaxed">{hint}</p>}
      </div>

      <div className="flex flex-col gap-2">
        {externalBrowserHref && (
          <a
            href={externalBrowserHref}
            className="inline-flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-semibold text-sm py-2.5 rounded-lg transition-colors"
          >
            <ExternalLink size={14} />
            {openBrowserLabel}
          </a>
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white text-sm py-2.5 rounded-lg transition-colors border border-gray-600"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? copiedLabel : copyButtonLabel}
        </button>
      </div>
    </div>
  )
}
