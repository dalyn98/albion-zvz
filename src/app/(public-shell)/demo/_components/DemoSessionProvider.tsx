'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  INITIAL_DEMO_JOURNEY_STATE,
  changeDemoJourneyActor,
  getDemoJourneyProjection,
  parseDemoJourneyState,
  runDemoJourneyCommand,
  type DemoJourneyActor,
  type DemoJourneyCommand,
  type DemoJourneyProjection,
  type DemoJourneyState,
} from '@/lib/demo-journey'

export const DEMO_SESSION_STORAGE_KEY = 'albion.demo.journey.v1'

interface DemoSessionContextValue {
  state: DemoJourneyState
  projection: DemoJourneyProjection
  hydrated: boolean
  setActor: (actor: DemoJourneyActor) => void
  runCommand: (command: DemoJourneyCommand) => void
  reset: () => void
}

const DemoSessionContext = createContext<DemoSessionContextValue | null>(null)

export function useDemoSession(): DemoSessionContextValue {
  const value = useContext(DemoSessionContext)
  if (!value) {
    throw new Error('useDemoSession must be used inside <DemoSessionProvider>')
  }
  return value
}

export default function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DemoJourneyState>(INITIAL_DEMO_JOURNEY_STATE)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let restored = INITIAL_DEMO_JOURNEY_STATE
    try {
      restored = parseDemoJourneyState(
        window.sessionStorage.getItem(DEMO_SESSION_STORAGE_KEY),
      )
    } catch {
      // Storage can be blocked; the in-memory demo remains fully usable.
    }
    // Browser-only session restoration intentionally happens after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState(restored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.sessionStorage.setItem(DEMO_SESSION_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage can be blocked; keep the current tab's in-memory state.
    }
  }, [hydrated, state])

  const setActor = useCallback((actor: DemoJourneyActor) => {
    setState((current) => changeDemoJourneyActor(current, actor))
  }, [])

  const runCommand = useCallback((command: DemoJourneyCommand) => {
    setState((current) => runDemoJourneyCommand(current, command))
  }, [])

  const reset = useCallback(() => {
    try {
      window.sessionStorage.removeItem(DEMO_SESSION_STORAGE_KEY)
    } catch {
      // In-memory reset is still authoritative for this tab.
    }
    setState(INITIAL_DEMO_JOURNEY_STATE)
  }, [])

  const projection = useMemo(() => getDemoJourneyProjection(state), [state])
  const value = useMemo<DemoSessionContextValue>(
    () => ({ state, projection, hydrated, setActor, runCommand, reset }),
    [state, projection, hydrated, setActor, runCommand, reset],
  )

  return (
    <DemoSessionContext.Provider value={value}>
      {children}
    </DemoSessionContext.Provider>
  )
}
