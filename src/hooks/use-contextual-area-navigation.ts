'use client'

import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import {
  parseNavigationVisitMemory,
  resolveContextualAreaDestinations,
  updateNavigationVisitMemory,
  type AreaNavigationGroup,
  type AreaNavigationSourceItem,
  type ContextualAreaDestination,
  type NavigationAudience,
  type NavigationVisitMemory,
} from '@/lib/app-navigation'

interface LabeledNavigationItem extends AreaNavigationSourceItem {
  label: string
}

interface UseContextualAreaNavigationInput<T extends LabeledNavigationItem> {
  currentHref: string
  groups: readonly AreaNavigationGroup<T>[]
  storageScope: string
  fallbackAudience: NavigationAudience
}

interface ContextualAreaNavigationState {
  destinations: ContextualAreaDestination[]
  activeAudience: NavigationAudience
  recentHrefs: string[]
}

const EMPTY_MEMORY: NavigationVisitMemory = {
  version: 1,
  visits: {},
  recent: [],
}

function catalogSignature<T extends LabeledNavigationItem>(
  groups: readonly AreaNavigationGroup<T>[],
): string {
  return groups.map((group) => [
    group.area,
    group.memberItems.map((item) => item.href).join(','),
    group.operatorItems.map((item) => item.href).join(','),
  ].join(':')).join('|')
}

export function useContextualAreaNavigation<T extends LabeledNavigationItem>({
  currentHref,
  groups,
  storageScope,
  fallbackAudience,
}: UseContextualAreaNavigationInput<T>): ContextualAreaNavigationState {
  const [memory, setMemory] = useState<NavigationVisitMemory>(EMPTY_MEMORY)
  const [hydrated, setHydrated] = useState(false)
  const loadedStorageKeyRef = useRef<string | null>(null)
  const getCurrentGroups = useEffectEvent(() => groups)
  const signature = catalogSignature(groups)
  const storageKey = `agm.contextual-navigation.v1.${storageScope}`

  useEffect(() => {
    loadedStorageKeyRef.current = null
    let nextMemory = EMPTY_MEMORY
    try {
      const raw = window.localStorage.getItem(storageKey)
      nextMemory = parseNavigationVisitMemory(raw ? JSON.parse(raw) : null, getCurrentGroups())
    } catch {
      nextMemory = EMPTY_MEMORY
    }
    // Client-only preference hydration; SSR keeps the deterministic fallback links.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemory(nextMemory)
    loadedStorageKeyRef.current = storageKey
    setHydrated(true)
  }, [signature, storageKey])

  useEffect(() => {
    if (!hydrated || loadedStorageKeyRef.current !== storageKey) return
    const currentGroups = getCurrentGroups()
    setMemory((previous) => {
      const next = updateNavigationVisitMemory({
        currentHref,
        groups: currentGroups,
        previous,
        fallbackAudience,
      })
      if (JSON.stringify(next) === JSON.stringify(previous)) return previous
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next))
      } catch {
        // Navigation memory is an optional enhancement.
      }
      return next
    })
  }, [currentHref, fallbackAudience, hydrated, signature, storageKey])

  const destinations = useMemo(
    () => resolveContextualAreaDestinations({
      currentHref,
      groups,
      visits: memory,
      fallbackAudience,
    }),
    [currentHref, fallbackAudience, groups, memory],
  )
  const activeAudience = destinations.find((item) => item.active)?.audience
    ?? fallbackAudience

  return {
    destinations,
    activeAudience,
    recentHrefs: memory.recent,
  }
}
