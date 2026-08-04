'use client'

import { useEffect } from 'react'

type ClientSeoEvent =
  | 'landing_view'
  | 'feature_card_click'
  | 'cta_demo_click'
  | 'cta_docs_click'
  | 'cta_bot_install_click'
  | 'language_switch'
  | 'battles_board_view'
  | 'battles_search'
  | 'battle_report_open'
  | 'guild_record_open'
  | 'alliance_record_open'
  | 'battle_share'
  | 'guild_connect'

interface AttributionPayload {
  eventType: ClientSeoEvent
  path: string
  referrer?: string
  target?: string
}

const TRACKABLE_EVENTS = new Set<ClientSeoEvent>([
  'landing_view',
  'feature_card_click',
  'cta_demo_click',
  'cta_docs_click',
  'cta_bot_install_click',
  'language_switch',
  'battles_board_view',
  'battles_search',
  'battle_report_open',
  'guild_record_open',
  'alliance_record_open',
  'battle_share',
  'guild_connect',
])

function battlesViewEvent(pathname: string): ClientSeoEvent | null {
  if (/\/zvz-battles\/battle\/(west|east|europe)\/\d+$/.test(pathname)) return 'battle_report_open'
  if (/\/zvz-battles\/guild\/(west|east|europe)\//.test(pathname)) return 'guild_record_open'
  if (/\/zvz-battles\/alliance\/(west|east|europe)\//.test(pathname)) return 'alliance_record_open'
  if (/(^|\/(ko|ja|en|zh))\/zvz-battles$/.test(pathname) || pathname === '/public/zvz-battles') return 'battles_board_view'
  return null
}

function sendAttribution(payload: AttributionPayload): void {
  void fetch('/api/marketing/attribution', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Best-effort marketing telemetry must never affect navigation.
  })
}

function currentPath(): string {
  return `${window.location.pathname}${window.location.search}`
}

function targetFromElement(element: Element): string | undefined {
  const explicit = element.getAttribute('data-seo-target')
  if (explicit) return explicit
  const link = element.closest('a[href]')
  const href = link?.getAttribute('href')
  return href || undefined
}

export default function MarketingAttributionTracker() {
  useEffect(() => {
    sendAttribution({
      eventType: 'landing_view',
      path: currentPath(),
      referrer: document.referrer || undefined,
    })
    const viewEvent = battlesViewEvent(window.location.pathname)
    if (viewEvent) {
      sendAttribution({
        eventType: viewEvent,
        path: currentPath(),
        referrer: document.referrer || undefined,
      })
    }
    if (viewEvent === 'battles_board_view' && new URLSearchParams(window.location.search).has('q')) {
      sendAttribution({
        eventType: 'battles_search',
        path: currentPath(),
        referrer: document.referrer || undefined,
      })
    }

    const onClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const tracked = target.closest('[data-seo-event]')
      if (!tracked) return
      const eventType = tracked.getAttribute('data-seo-event')
      if (!TRACKABLE_EVENTS.has(eventType as ClientSeoEvent)) return
      sendAttribution({
        eventType: eventType as ClientSeoEvent,
        path: currentPath(),
        referrer: document.referrer || undefined,
        target: targetFromElement(tracked),
      })
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  return null
}
