'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  registerPushSubscription,
  unregisterPushSubscription,
  sendTestPush,
} from '@/app/actions/push'
import { useToast } from './ToastProvider'

interface Props {
  publicKey: string | null
}

type Status = 'unsupported' | 'denied' | 'off' | 'on' | 'loading'

// base64url → ArrayBuffer (applicationServerKey 용). Uint8Array 가 아니라
// ArrayBuffer 를 반환해 TS 의 SharedArrayBuffer 유니언 오류를 피한다.
function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const buf = new ArrayBuffer(raw.length)
  const view = new Uint8Array(buf)
  for (let i = 0; i < raw.length; ++i) view[i] = raw.charCodeAt(i)
  return buf
}

export default function PushToggle({ publicKey }: Props) {
  const t = useTranslations('pushNotifications')
  const toast = useToast()
  const [status, setStatus] = useState<Status>('loading')
  const [testing, startTest] = useTransition()

  const refreshStatus = useCallback(async () => {
    if (typeof window === 'undefined') return
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    if (!supported || !publicKey) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await registration?.pushManager.getSubscription()
      setStatus(sub ? 'on' : 'off')
    } catch {
      setStatus('off')
    }
  }, [publicKey])

  useEffect(() => {
    // Sync the toggle to the actual SW subscription on mount. Effects are the
    // correct place for this — we can't know SW state at render time.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus()
  }, [refreshStatus])

  const enable = async () => {
    if (!publicKey) return
    setStatus('loading')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off')
        if (permission === 'denied') toast.error(t('permissionDenied'))
        return
      }

      // Re-use an existing registration — avoids kicking the user's current SW.
      const registration =
        (await navigator.serviceWorker.getRegistration('/sw.js')) ??
        (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready

      const existing = await registration.pushManager.getSubscription()
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        }))

      const json = subscription.toJSON() as { endpoint?: string; keys?: Record<string, string> }
      const res = await registerPushSubscription({
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      })
      if (res.error) {
        toast.error(res.error)
        setStatus('off')
        return
      }
      toast.success(t('enabledMessage'))
      setStatus('on')
    } catch (e) {
      console.error('[push] enable failed:', e)
      toast.error(t('enableFailed'))
      setStatus('off')
    }
  }

  const disable = async () => {
    setStatus('loading')
    try {
      const registration = await navigator.serviceWorker.getRegistration('/sw.js')
      const sub = await registration?.pushManager.getSubscription()
      if (sub) {
        await unregisterPushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      toast.info(t('disabledMessage'))
      setStatus('off')
    } catch (e) {
      console.error('[push] disable failed:', e)
      toast.error(t('disableFailed'))
      await refreshStatus()
    }
  }

  const test = () => {
    startTest(async () => {
      const res = await sendTestPush()
      if (res.error) {
        toast.error(res.error)
        return
      }
      if ((res.sent ?? 0) === 0) {
        toast.info(t('testNoDevices'))
      } else {
        toast.success(t('testSent', { count: res.sent ?? 0 }))
      }
    })
  }

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-white">{t('title')}</h2>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{t('description')}</p>

      {status === 'unsupported' && (
        <p className="text-xs text-gray-500">{t('unsupported')}</p>
      )}

      {status === 'denied' && (
        <p className="text-xs text-rose-300">{t('permissionBlocked')}</p>
      )}

      {(status === 'off' || status === 'loading') && (
        <button
          type="button"
          onClick={enable}
          disabled={status === 'loading' || !publicKey}
          className="inline-flex items-center gap-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
        >
          <Bell size={13} />
          {status === 'loading' ? t('loading') : t('enableButton')}
        </button>
      )}

      {status === 'on' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold px-2.5 py-1 rounded-full">
            <BellRing size={12} />
            {t('enabledBadge')}
          </span>
          <button
            type="button"
            onClick={test}
            disabled={testing}
            className="text-xs text-amber-300 hover:text-amber-200 font-semibold disabled:opacity-50"
          >
            {testing ? t('testing') : t('testButton')}
          </button>
          <button
            type="button"
            onClick={disable}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-rose-300 font-semibold"
          >
            <BellOff size={12} />
            {t('disableButton')}
          </button>
        </div>
      )}
    </section>
  )
}
