'use client'

import { useOptimistic, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { Clock3, LoaderCircle, SlidersHorizontal } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { buildPublicZvzBoardHref, type PublicZvzFilterServer } from '@/lib/public-zvz-filter-hrefs'
import type { PublicZvzDivisionFilter } from '@/lib/public-zvz-divisions'

export interface PublicZvzNavigationOption {
  value: string
  label: string
  href: string
}

interface PublicZvzNavigationSelectProps {
  label: string
  value: string
  options: PublicZvzNavigationOption[]
  updatingLabel: string
}

export function PublicZvzNavigationSelect({
  label,
  value,
  options,
  updatingLabel,
}: PublicZvzNavigationSelectProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimisticValue, setOptimisticValue] = useOptimistic(value)

  const selectOption = (nextValue: string) => {
    if (nextValue === optimisticValue) return
    const option = options.find((candidate) => candidate.value === nextValue)
    if (!option) return

    startTransition(() => {
      setOptimisticValue(nextValue)
      router.replace(option.href, { scroll: false })
    })
  }

  return (
    <label className="grid min-w-44 gap-1 text-xs font-semibold text-gray-300">
      <span>{label}</span>
      <span className="relative">
        <select
          value={optimisticValue}
          onChange={(event) => selectOption(event.currentTarget.value)}
          aria-busy={isPending}
          className="h-11 w-full appearance-none rounded-lg border border-white/[0.12] bg-black/25 px-3 pr-10 text-sm text-white outline-none transition-[border-color,box-shadow] focus:border-amber-200 focus:shadow-[0_0_0_2px_rgba(252,211,77,0.18)]"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {isPending ? (
          <LoaderCircle
            size={15}
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3.5 animate-spin text-amber-200"
          />
        ) : (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-3 top-3 text-gray-500"
          >
            ▾
          </span>
        )}
      </span>
      {isPending ? <span className="sr-only">{updatingLabel}</span> : null}
    </label>
  )
}

interface PublicZvzForcePreset {
  value: number
  label: string
}

interface PublicZvzRecentSectionProps {
  basePath: string
  server: PublicZvzFilterServer
  division: PublicZvzDivisionFilter
  minPlayers: number
  defaultMinPlayers: number
  minimumMinPlayers: number
  maximumMinPlayers: number
  seasonId?: string | null
  asOfDate?: string | null
  query?: string | null
  entityKind?: 'guild' | 'alliance'
  title: string
  filterLabel: string
  customOptionLabel: string
  customInputLabel: string
  customInputPlaceholder: string
  forceUnitLabel: string
  applyLabel: string
  updatingLabel: string
  presets: PublicZvzForcePreset[]
  children: ReactNode
}

export function PublicZvzRecentSection({
  basePath,
  server,
  division,
  minPlayers,
  defaultMinPlayers,
  minimumMinPlayers,
  maximumMinPlayers,
  seasonId,
  asOfDate,
  query,
  entityKind,
  title,
  filterLabel,
  customOptionLabel,
  customInputLabel,
  customInputPlaceholder,
  forceUnitLabel,
  applyLabel,
  updatingLabel,
  presets,
  children,
}: PublicZvzRecentSectionProps) {
  const router = useRouter()
  const initialIsCustom = !presets.some((preset) => preset.value === minPlayers)
  const [isPending, startTransition] = useTransition()
  const [optimisticMinPlayers, setOptimisticMinPlayers] = useOptimistic(minPlayers)
  const [customOpen, setCustomOpen] = useState(initialIsCustom)
  const [customValue, setCustomValue] = useState(String(minPlayers))

  const selectedPreset = presets.find((preset) => preset.value === optimisticMinPlayers)
  const selectedValue = customOpen || !selectedPreset ? 'custom' : String(selectedPreset.value)

  const navigateToMinPlayers = (nextMinPlayers: number) => {
    const href = buildPublicZvzBoardHref({
      basePath,
      server,
      division,
      minPlayers: nextMinPlayers,
      defaultMinPlayers,
      seasonId,
      asOfDate,
      query,
      entityKind,
    })

    startTransition(() => {
      setOptimisticMinPlayers(nextMinPlayers)
      router.replace(href, { scroll: false })
    })
  }

  const selectPreset = (nextValue: string) => {
    if (nextValue === 'custom') {
      setCustomOpen(true)
      return
    }

    const parsed = Number(nextValue)
    if (!Number.isSafeInteger(parsed)) return
    setCustomOpen(false)
    setCustomValue(String(parsed))
    navigateToMinPlayers(parsed)
  }

  const applyCustomValue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsed = Number(customValue)
    if (!Number.isFinite(parsed)) return

    const normalized = Math.min(maximumMinPlayers, Math.max(minimumMinPlayers, Math.trunc(parsed)))
    setCustomValue(String(normalized))
    navigateToMinPlayers(normalized)
  }

  return (
    <section className="mt-8" aria-busy={isPending}>
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-sky-200">
            <Clock3 size={18} />
            <h2 className="text-balance text-xl font-black text-white">{title}</h2>
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] p-2 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          <label className="sr-only" htmlFor="public-zvz-recent-force-filter">
            {filterLabel}
          </label>
          <div className="relative">
            <SlidersHorizontal
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-3.5 text-amber-200"
            />
            <select
              id="public-zvz-recent-force-filter"
              value={selectedValue}
              onChange={(event) => selectPreset(event.currentTarget.value)}
              aria-controls="public-zvz-recent-results"
              className="h-11 w-full min-w-64 appearance-none rounded-lg border border-white/[0.12] bg-black/25 pl-9 pr-10 text-sm font-semibold text-white outline-none transition-[border-color,box-shadow] focus:border-amber-200 focus:shadow-[0_0_0_2px_rgba(252,211,77,0.18)]"
            >
              {presets.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
              <option value="custom">{customOptionLabel}</option>
            </select>
            {isPending ? (
              <LoaderCircle
                size={15}
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-3.5 animate-spin text-amber-200"
              />
            ) : (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-3 text-gray-500"
              >
                ▾
              </span>
            )}
          </div>

          {customOpen ? (
            <form onSubmit={applyCustomValue} className="mt-2 flex items-center gap-2">
              <label className="sr-only" htmlFor="public-zvz-custom-force">
                {customInputLabel}
              </label>
              <div className="relative min-w-0 flex-1">
                <input
                  id="public-zvz-custom-force"
                  type="number"
                  inputMode="numeric"
                  min={minimumMinPlayers}
                  max={maximumMinPlayers}
                  step={1}
                  required
                  value={customValue}
                  onChange={(event) => setCustomValue(event.currentTarget.value)}
                  placeholder={customInputPlaceholder}
                  autoComplete="off"
                  className="h-11 w-full rounded-lg border border-white/[0.12] bg-black/25 px-3 pr-16 text-sm tabular-nums text-white outline-none transition-[border-color,box-shadow] placeholder:text-gray-500 focus:border-amber-200 focus:shadow-[0_0_0_2px_rgba(252,211,77,0.18)]"
                />
                <span className="pointer-events-none absolute right-3 top-3.5 text-[11px] text-gray-500">
                  {forceUnitLabel}
                </span>
              </div>
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-amber-300 px-3 text-xs font-bold text-slate-950 transition-[background-color,scale] duration-150 ease-out hover:bg-amber-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-100"
              >
                {applyLabel}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      {isPending ? (
        <span className="sr-only" role="status" aria-live="polite">
          {updatingLabel}
        </span>
      ) : null}
      <div
        id="public-zvz-recent-results"
        className={`transition-[opacity] duration-150 ease-out ${
          isPending ? 'opacity-55' : 'opacity-100'
        }`}
      >
        {children}
      </div>
    </section>
  )
}
