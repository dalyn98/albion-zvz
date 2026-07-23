'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ChevronDown, Search, X } from 'lucide-react'
import {
  isNavigationItemActive,
  searchNavigationItems,
  type ContextualAreaDestination,
} from '@/lib/app-navigation'
import type { AppArea } from '@/lib/app-route-registry'
import { acquireBodyScrollLock } from '@/lib/body-scroll-lock'
import { GuardedLink } from './UnsavedChangesProvider'

type NavigationIcon = React.ComponentType<{ size?: number; className?: string }>

export interface AreaNavigationItem {
  href: string
  label: string
  icon: NavigationIcon
  exact?: boolean
  badge?: number
  aliases?: string
}

export interface AreaNavigationGroup {
  area: AppArea
  label: string
  icon: NavigationIcon
  badge: number
  memberItems: AreaNavigationItem[]
  operatorItems: AreaNavigationItem[]
}

interface AreaNavigationLabels {
  featureSearch: string
  featureSearchPlaceholder: string
  featureSearchDescription: string
  noSearchResults: string
  myWork: string
  guildOperations: string
  currentArea: string
  close: string
  expandArea: (area: string) => string
  collapseArea: (area: string) => string
  areaDestination: (area: string, destination: string) => string
  moreItems: (count: number) => string
}

interface AreaNavigationProps {
  groups: AreaNavigationGroup[]
  destinations: ContextualAreaDestination[]
  recentHrefs: string[]
  activeArea: AppArea
  currentHref: string
  expanded: boolean
  labels: AreaNavigationLabels
  variant?: 'app' | 'demo'
  searchEnabled?: boolean
  onNavigate?: () => void
}

type IntentLinkProps = ComponentProps<typeof GuardedLink>

function IntentLink({ href, onPointerEnter, onFocus, ...props }: IntentLinkProps) {
  const router = useRouter()
  const prefetchedRef = useRef(false)
  const prefetch = () => {
    if (prefetchedRef.current || typeof href !== 'string' || !href.startsWith('/')) return
    prefetchedRef.current = true
    router.prefetch(href)
  }

  return (
    <GuardedLink
      {...props}
      href={href}
      prefetch={false}
      onPointerEnter={(event) => {
        prefetch()
        onPointerEnter?.(event)
      }}
      onFocus={(event) => {
        prefetch()
        onFocus?.(event)
      }}
    />
  )
}

function ItemLink({
  item,
  currentHref,
  variant,
  onNavigate,
  resultRef,
  onKeyDown,
  path,
}: {
  item: AreaNavigationItem
  currentHref: string
  variant: 'app' | 'demo'
  onNavigate?: () => void
  resultRef?: (node: HTMLAnchorElement | null) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLAnchorElement>) => void
  path?: string
}) {
  const Icon = item.icon
  const active = isNavigationItemActive(currentHref, item)
  const hasBadge = typeof item.badge === 'number' && item.badge > 0
  const appClasses = active
    ? 'bg-accent-soft text-accent-soft-foreground'
    : 'text-muted hover:bg-surface-2 hover:text-foreground'
  const demoClasses = active
    ? 'bg-amber-500/20 text-amber-200'
    : 'text-gray-400 hover:bg-white/5 hover:text-white'

  return (
    <IntentLink
      ref={resultRef}
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onNavigate={onNavigate}
      onKeyDown={onKeyDown}
      className={`group flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-[background-color,color,transform] duration-150 active:scale-[0.96] ${
        variant === 'demo' ? demoClasses : appClasses
      }`}
    >
      <Icon size={15} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {path && (
          <span className={`mt-0.5 block truncate text-[10px] ${
            variant === 'demo' ? 'text-gray-500' : 'text-subtle'
          }`}>
            {path}
          </span>
        )}
      </span>
      {hasBadge && (
        <span className="min-w-5 shrink-0 rounded-full bg-danger px-1.5 text-center text-[10px] font-bold leading-5 text-danger-foreground">
          {item.badge! > 99 ? '99+' : item.badge}
        </span>
      )}
    </IntentLink>
  )
}

function AudienceItems({
  label,
  items,
  currentHref,
  variant,
  onNavigate,
}: {
  label: string
  items: AreaNavigationItem[]
  currentHref: string
  variant: 'app' | 'demo'
  onNavigate?: () => void
}) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      <p className={`px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${
        variant === 'demo' ? 'text-gray-500' : 'text-subtle'
      }`}>
        {label}
      </p>
      {items.map((item) => (
        <ItemLink
          key={item.href}
          item={item}
          currentHref={currentHref}
          variant={variant}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}

export default function AreaNavigation({
  groups,
  destinations,
  recentHrefs,
  activeArea,
  currentHref,
  expanded,
  labels,
  variant = 'app',
  searchEnabled = true,
  onNavigate,
}: AreaNavigationProps) {
  const [expandedAreas, setExpandedAreas] = useState<Set<AppArea>>(() => new Set([activeArea]))
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [previewArea, setPreviewArea] = useState<AppArea | null>(null)
  const [previewTop, setPreviewTop] = useState(72)
  const searchTriggerRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchDialogRef = useRef<HTMLDivElement>(null)
  const resultRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const openPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closePreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!searchEnabled) return
    const openFromShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', openFromShortcut)
    return () => window.removeEventListener('keydown', openFromShortcut)
  }, [searchEnabled])

  useEffect(() => {
    if (!searchOpen) return
    const searchTrigger = searchTriggerRef.current
    const releaseScrollLock = acquireBodyScrollLock()
    const focusTimer = window.setTimeout(() => searchInputRef.current?.focus(), 50)
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSearchOpen(false)
        return
      }
      if (event.key !== 'Tab') return
      const focusable = searchDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      const first = focusable?.[0]
      const last = focusable?.[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleDialogKeys)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleDialogKeys)
      releaseScrollLock()
      queueMicrotask(() => searchTrigger?.focus())
    }
  }, [searchOpen])

  useEffect(() => () => {
    if (openPreviewTimer.current) clearTimeout(openPreviewTimer.current)
    if (closePreviewTimer.current) clearTimeout(closePreviewTimer.current)
  }, [])

  const searchItems = useMemo(() => groups.flatMap((group) => [
    ...group.memberItems.map((item) => ({
      ...item,
      areaLabel: group.label,
      audienceLabel: labels.myWork,
    })),
    ...group.operatorItems.map((item) => ({
      ...item,
      areaLabel: group.label,
      audienceLabel: labels.guildOperations,
    })),
  ]), [groups, labels.guildOperations, labels.myWork])
  const searchResults = useMemo(() => {
    if (query.trim()) return searchNavigationItems(searchItems, query)
    const recentRank = new Map(recentHrefs.map((href, index) => [href, index]))
    return [...searchItems].sort((left, right) => {
      const leftRecent = recentRank.get(left.href)
      const rightRecent = recentRank.get(right.href)
      if (leftRecent !== undefined || rightRecent !== undefined) {
        if (leftRecent === undefined) return 1
        if (rightRecent === undefined) return -1
        return leftRecent - rightRecent
      }
      return (right.badge ?? 0) - (left.badge ?? 0)
    })
  }, [query, recentHrefs, searchItems])
  const previewGroup = groups.find((group) => group.area === previewArea)
  const destinationByArea = new Map(destinations.map((item) => [item.area, item]))

  const toggleArea = (area: AppArea) => {
    setExpandedAreas((previous) => {
      const isMobile = window.matchMedia('(max-width: 1023px)').matches
      if (isMobile) return previous.has(area) ? new Set() : new Set([area])
      const next = new Set(previous)
      if (next.has(area)) next.delete(area)
      else next.add(area)
      return next
    })
  }
  const schedulePreview = (area: AppArea, top: number, immediate = false) => {
    if (closePreviewTimer.current) clearTimeout(closePreviewTimer.current)
    if (openPreviewTimer.current) clearTimeout(openPreviewTimer.current)
    const openPreview = () => {
      setPreviewTop(Math.max(64, Math.min(top, window.innerHeight - 360)))
      setPreviewArea(area)
    }
    if (immediate) openPreview()
    else openPreviewTimer.current = setTimeout(openPreview, 130)
  }
  const schedulePreviewClose = () => {
    if (openPreviewTimer.current) clearTimeout(openPreviewTimer.current)
    if (closePreviewTimer.current) clearTimeout(closePreviewTimer.current)
    closePreviewTimer.current = setTimeout(() => setPreviewArea(null), 240)
  }
  const handleSearchInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowDown' || searchResults.length === 0) return
    event.preventDefault()
    resultRefs.current[0]?.focus()
  }
  const handleResultKeyDown = (
    event: ReactKeyboardEvent<HTMLAnchorElement>,
    index: number,
  ) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    if (event.key === 'ArrowUp' && index === 0) {
      searchInputRef.current?.focus()
      return
    }
    const nextIndex = event.key === 'ArrowDown'
      ? Math.min(index + 1, searchResults.length - 1)
      : Math.max(index - 1, 0)
    resultRefs.current[nextIndex]?.focus()
  }

  const surface = variant === 'demo'
    ? 'border-white/10 bg-[#11141c]/98 text-white shadow-2xl'
    : 'border-border bg-surface text-foreground shadow-lift'
  const muted = variant === 'demo' ? 'text-gray-500' : 'text-subtle'
  const hover = variant === 'demo'
    ? 'hover:bg-white/5 hover:text-white'
    : 'hover:bg-surface-2 hover:text-foreground'

  return (
    <>
      <div className="space-y-2 px-2">
        {expanded && searchEnabled && (
          <button
            ref={searchTriggerRef}
            type="button"
            onClick={() => setSearchOpen(true)}
            className={`flex min-h-10 w-full items-center gap-2 rounded-lg border px-3 text-sm transition-colors ${
              variant === 'demo'
                ? 'border-white/10 bg-white/[0.03] text-gray-400 hover:border-amber-400/30 hover:text-white'
                : 'border-border bg-background/45 text-muted hover:border-accent/35 hover:text-foreground'
            }`}
          >
            <Search size={15} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">{labels.featureSearch}</span>
            <kbd className={`rounded border px-1.5 py-0.5 text-[9px] ${
              variant === 'demo' ? 'border-white/10 text-gray-500' : 'border-border text-subtle'
            }`}>
              ⌘K
            </kbd>
          </button>
        )}

        {groups.map((group) => {
          const Icon = group.icon
          const areaOpen = expandedAreas.has(group.area)
          const active = group.area === activeArea
          const destination = destinationByArea.get(group.area)
          const contentId = `area-navigation-${variant}-${group.area}`
          if (!destination) return null
          if (!expanded) {
            return (
              <IntentLink
                key={group.area}
                href={destination.href}
                title={destination.destinationLabel}
                aria-current={active ? 'page' : undefined}
                aria-label={labels.areaDestination(group.label, destination.destinationLabel)}
                onNavigate={onNavigate}
                onPointerEnter={(event) => schedulePreview(group.area, event.currentTarget.getBoundingClientRect().top)}
                onPointerLeave={schedulePreviewClose}
                onFocus={(event) => schedulePreview(group.area, event.currentTarget.getBoundingClientRect().top, true)}
                onBlur={schedulePreviewClose}
                className={`relative flex min-h-11 w-full items-center justify-center rounded-lg border-l-2 transition-colors ${
                  active
                    ? variant === 'demo'
                      ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                      : 'border-accent bg-accent-soft text-accent-soft-foreground'
                    : `border-transparent ${variant === 'demo' ? 'text-gray-400' : 'text-muted'} ${hover}`
                }`}
              >
                <Icon size={19} aria-hidden="true" />
                {group.badge > 0 && (
                  <span className="absolute right-0 top-0 min-w-4 rounded-full bg-danger px-1 text-center text-[9px] font-bold leading-4 tabular-nums text-danger-foreground">
                    {group.badge > 99 ? '99+' : group.badge}
                  </span>
                )}
              </IntentLink>
            )
          }

          return (
            <section key={group.area} className="space-y-1">
              <div className={`grid min-h-12 grid-cols-[minmax(0,1fr)_2.75rem] overflow-hidden rounded-lg border-l-2 ${
                active
                  ? variant === 'demo'
                    ? 'border-amber-400 bg-amber-500/10 text-amber-100'
                    : 'border-accent bg-accent-soft text-accent-soft-foreground'
                  : `border-transparent ${variant === 'demo' ? 'text-gray-300' : 'text-muted'}`
              }`}>
                <IntentLink
                  href={destination.href}
                  aria-current={active ? 'location' : undefined}
                  aria-label={labels.areaDestination(group.label, destination.destinationLabel)}
                  onNavigate={onNavigate}
                  className={`flex min-w-0 items-center gap-3 px-3 py-2 text-sm font-medium transition-[background-color,color,transform] active:scale-[0.96] ${hover}`}
                >
                  <Icon size={16} className="shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate">{group.label}</span>
                    <span className={`mt-0.5 block truncate text-[10px] font-normal ${
                      variant === 'demo' ? 'text-gray-500' : 'text-subtle'
                    }`}>
                      {destination.destinationLabel}
                      {destination.remainingItemCount > 0
                        ? ` · ${labels.moreItems(destination.remainingItemCount)}`
                        : ''}
                    </span>
                  </span>
                  {active && <span className="sr-only">{labels.currentArea}</span>}
                  {group.badge > 0 && (
                    <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[10px] font-bold leading-5 tabular-nums text-danger-foreground">
                      {group.badge > 99 ? '99+' : group.badge}
                    </span>
                  )}
                </IntentLink>
                <button
                  type="button"
                  aria-expanded={areaOpen}
                  aria-controls={contentId}
                  aria-label={areaOpen ? labels.collapseArea(group.label) : labels.expandArea(group.label)}
                  onClick={() => toggleArea(group.area)}
                  className={`inline-flex min-h-11 items-center justify-center transition-[background-color,color,transform] active:scale-[0.96] ${hover}`}
                >
                  <ChevronDown
                    size={14}
                    className={`shrink-0 transition-transform duration-150 ${areaOpen ? '' : '-rotate-90'}`}
                    aria-hidden="true"
                  />
                </button>
              </div>
              <div id={contentId} hidden={!areaOpen} className="ml-2 space-y-2 border-l border-current/10 pl-1">
                <AudienceItems
                  label={labels.myWork}
                  items={group.memberItems}
                  currentHref={currentHref}
                  variant={variant}
                  onNavigate={onNavigate}
                />
                <AudienceItems
                  label={labels.guildOperations}
                  items={group.operatorItems}
                  currentHref={currentHref}
                  variant={variant}
                  onNavigate={onNavigate}
                />
              </div>
            </section>
          )
        })}
      </div>

      {!expanded && previewGroup && typeof document !== 'undefined' && createPortal(
        <div
          role="region"
          aria-label={previewGroup.label}
          onPointerEnter={() => {
            if (closePreviewTimer.current) clearTimeout(closePreviewTimer.current)
          }}
          onPointerLeave={schedulePreviewClose}
          className={`fixed left-[68px] z-[70] w-72 max-h-[min(70vh,36rem)] overflow-y-auto rounded-xl border p-2 ${surface}`}
          style={{ top: previewTop }}
        >
          <div className="flex items-center gap-2 px-3 py-2">
            <previewGroup.icon size={16} aria-hidden="true" />
            <p className="flex-1 text-sm font-semibold">{previewGroup.label}</p>
            {previewGroup.badge > 0 && (
              <span className="min-w-5 rounded-full bg-danger px-1.5 text-center text-[10px] font-bold leading-5 text-danger-foreground">
                {previewGroup.badge > 99 ? '99+' : previewGroup.badge}
              </span>
            )}
          </div>
          <AudienceItems
            label={labels.myWork}
            items={previewGroup.memberItems}
            currentHref={currentHref}
            variant={variant}
            onNavigate={onNavigate}
          />
          <AudienceItems
            label={labels.guildOperations}
            items={previewGroup.operatorItems}
            currentHref={currentHref}
            variant={variant}
            onNavigate={onNavigate}
          />
        </div>,
        document.body,
      )}

      {searchOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-black/70 px-4 pt-[max(8vh,3rem)] backdrop-blur-sm"
          onMouseDown={() => setSearchOpen(false)}
        >
          <div
            ref={searchDialogRef}
            data-feature-search-dialog
            role="dialog"
            aria-modal="true"
            aria-labelledby="feature-search-title"
            aria-describedby="feature-search-description"
            onMouseDown={(event) => event.stopPropagation()}
            className={`w-full max-w-xl overflow-hidden rounded-2xl border ${surface}`}
          >
            <div className="flex items-center gap-3 border-b border-current/10 px-4 py-3">
              <Search size={18} className={muted} aria-hidden="true" />
              <div className="sr-only">
                <h2 id="feature-search-title">{labels.featureSearch}</h2>
                <p id="feature-search-description">{labels.featureSearchDescription}</p>
              </div>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={handleSearchInputKeyDown}
                placeholder={labels.featureSearchPlaceholder}
                aria-label={labels.featureSearch}
                className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-current outline-none placeholder:text-current/40"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                aria-label={labels.close}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${muted} ${hover}`}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[60dvh] overflow-y-auto overscroll-contain p-2">
              {searchResults.length > 0 ? searchResults.map((item, index) => (
                <ItemLink
                  key={`${item.audienceLabel}:${item.href}`}
                  item={item}
                  currentHref={currentHref}
                  variant={variant}
                  resultRef={(node) => { resultRefs.current[index] = node }}
                  onKeyDown={(event) => handleResultKeyDown(event, index)}
                  onNavigate={() => {
                    setSearchOpen(false)
                    onNavigate?.()
                  }}
                  path={`${item.areaLabel} › ${item.audienceLabel}`}
                />
              )) : (
                <div className={`px-4 py-10 text-center text-sm ${muted}`}>
                  {labels.noSearchResults}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
