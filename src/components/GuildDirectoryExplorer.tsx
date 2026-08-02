'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  Languages,
  MapPin,
  RotateCcw,
  Search,
  Shield,
  Users,
} from 'lucide-react'
import {
  PROFILE_LANGUAGES,
  type ProfileLanguage,
  type ProfileServerOverride,
  type RecruitmentStatus,
} from '@/lib/guild-profile-config'
import {
  filterPublicGuildDirectoryEntries,
  type PublicGuildDirectoryEntry,
  type PublicGuildDirectoryFilters,
} from '@/lib/public-guild-directory'
import { cx, pressScaleClass, prettyTextClass } from '@/components/ui-patterns'

const SERVERS = ['west', 'east', 'europe'] as const
const RECRUITMENT_FILTERS = ['open', 'selective'] as const

interface GuildDirectoryExplorerProps {
  entries: PublicGuildDirectoryEntry[]
  guildPageBasePath: string
}

const INITIAL_FILTERS: PublicGuildDirectoryFilters = {
  query: '',
  server: '',
  recruitmentStatus: '',
  language: '',
}

export default function GuildDirectoryExplorer({
  entries,
  guildPageBasePath,
}: GuildDirectoryExplorerProps) {
  const t = useTranslations('publicGuildDirectory')
  const [filters, setFilters] = useState<PublicGuildDirectoryFilters>(INITIAL_FILTERS)
  const [shareState, setShareState] = useState<{ slug: string; ok: boolean } | null>(null)
  const visibleEntries = useMemo(
    () => filterPublicGuildDirectoryEntries(entries, filters),
    [entries, filters],
  )
  const filtersActive = Object.values(filters).some(Boolean)

  const profileHref = (slug: string) => `${guildPageBasePath}/${encodeURIComponent(slug)}`
  const copyProfileLink = async (entry: PublicGuildDirectoryEntry) => {
    try {
      const absoluteUrl = new URL(profileHref(entry.slug), window.location.origin).toString()
      await navigator.clipboard.writeText(absoluteUrl)
      setShareState({ slug: entry.slug, ok: true })
    } catch {
      setShareState({ slug: entry.slug, ok: false })
    }
  }

  return (
    <div className="space-y-5">
      <section aria-label={t('filtersLabel')} className="rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,0.7fr))]">
          <label className="relative block">
            <span className="sr-only">{t('searchLabel')}</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder={t('searchPlaceholder')}
              className="min-h-11 w-full rounded-lg border border-gray-700 bg-gray-950/80 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-sky-400"
            />
          </label>
          <DirectorySelect
            value={filters.server}
            label={t('serverFilter')}
            allLabel={t('allServers')}
            options={SERVERS.map((server) => ({ value: server, label: t(`servers.${server}`) }))}
            onChange={(value) => setFilters((current) => ({
              ...current,
              server: value as PublicGuildDirectoryFilters['server'],
            }))}
          />
          <DirectorySelect
            value={filters.language}
            label={t('languageFilter')}
            allLabel={t('allLanguages')}
            options={PROFILE_LANGUAGES.map((language) => ({
              value: language,
              label: t(`languages.${language}`),
            }))}
            onChange={(value) => setFilters((current) => ({
              ...current,
              language: value as '' | ProfileLanguage,
            }))}
          />
          <DirectorySelect
            value={filters.recruitmentStatus}
            label={t('recruitmentFilter')}
            allLabel={t('allRecruitment')}
            options={RECRUITMENT_FILTERS.map((status) => ({
              value: status,
              label: t(`recruitment.${status}`),
            }))}
            onChange={(value) => setFilters((current) => ({
              ...current,
              recruitmentStatus: value as '' | Exclude<RecruitmentStatus, 'closed'>,
            }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-400">
          <p>{t('resultCount', { count: visibleEntries.length })}</p>
          {filtersActive && (
            <button
              type="button"
              onClick={() => setFilters(INITIAL_FILTERS)}
              className={cx('inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 font-semibold text-sky-200 hover:bg-sky-400/10', pressScaleClass)}
            >
              <RotateCcw size={13} />
              {t('resetFilters')}
            </button>
          )}
        </div>
      </section>

      {visibleEntries.length === 0 ? (
        <section className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 px-5 py-12 text-center">
          <Users size={28} className="mx-auto text-gray-600" />
          <h2 className="mt-3 text-lg font-bold text-white">
            {entries.length === 0 ? t('emptyTitle') : t('noMatchTitle')}
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-gray-400">
            {entries.length === 0 ? t('emptyBody') : t('noMatchBody')}
          </p>
        </section>
      ) : (
        <section aria-label={t('resultsLabel')} className="grid gap-4 md:grid-cols-2">
          {visibleEntries.map((entry) => (
            <article key={entry.slug} className="flex flex-col rounded-xl border border-border bg-surface p-5 shadow-card transition-[border-color,transform] hover:border-sky-400/35">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gray-600">/g/{entry.slug}</p>
                  <h2 className="mt-1 truncate text-xl font-black text-white">{entry.name}</h2>
                </div>
                <RecruitmentBadge status={entry.recruitmentStatus} label={t(`recruitment.${entry.recruitmentStatus}`)} />
              </div>

              <p className={cx('mt-3 line-clamp-3 min-h-[3.75rem] text-sm leading-relaxed text-gray-300', prettyTextClass)}>
                {entry.description || t('descriptionFallback')}
              </p>

              <dl className="mt-4 grid gap-2 text-xs text-gray-300 sm:grid-cols-2">
                <DirectoryFact icon={MapPin} label={t('serverLabel')} value={entry.server ? t(`servers.${entry.server}`) : t('notSpecified')} />
                <DirectoryFact icon={Clock3} label={t('activeHoursLabel')} value={entry.activeHours || t('notSpecified')} />
                <DirectoryFact icon={Languages} label={t('languagesLabel')} value={entry.languages.length > 0 ? entry.languages.map((language) => t(`languages.${language}`)).join(', ') : t('notSpecified')} />
                <DirectoryFact icon={Shield} label={t('rolesLabel')} value={entry.recruitingRoles || t('notSpecified')} />
                {entry.eventSchedule && (
                  <DirectoryFact icon={CalendarDays} label={t('scheduleLabel')} value={entry.eventSchedule} className="sm:col-span-2" />
                )}
              </dl>

              <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
                <Link
                  href={profileHref(entry.slug)}
                  className={cx('inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-sky-300 px-4 text-sm font-black text-slate-950 transition-colors hover:bg-sky-200', pressScaleClass)}
                >
                  {t('viewProfile')}
                  <ExternalLink size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => void copyProfileLink(entry)}
                  className={cx('inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900/70 px-4 text-sm font-semibold text-gray-200 transition-colors hover:bg-gray-800', pressScaleClass)}
                >
                  {shareState?.slug === entry.slug && shareState.ok ? <Check size={14} /> : <Copy size={14} />}
                  {shareState?.slug === entry.slug
                    ? shareState.ok ? t('copied') : t('copyFailed')
                    : t('copyLink')}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      <p aria-live="polite" className="sr-only">
        {shareState ? (shareState.ok ? t('copyAnnouncement') : t('copyFailedAnnouncement')) : ''}
      </p>
    </div>
  )
}

function DirectorySelect({
  value,
  label,
  allLabel,
  options,
  onChange,
}: {
  value: string
  label: string
  allLabel: string
  options: ReadonlyArray<{ value: string; label: string }>
  onChange: (value: string) => void
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-lg border border-gray-700 bg-gray-950/80 px-3 text-sm text-gray-200 outline-none transition-colors focus:border-sky-400"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  )
}

function RecruitmentBadge({ status, label }: { status: 'open' | 'selective'; label: string }) {
  return (
    <span className={cx(
      'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black',
      status === 'open'
        ? 'border-emerald-400/35 bg-emerald-400/10 text-emerald-200'
        : 'border-amber-400/35 bg-amber-400/10 text-amber-100',
    )}>
      {label}
    </span>
  )
}

function DirectoryFact({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: typeof MapPin
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cx('rounded-lg border border-white/5 bg-black/15 p-3', className)}>
      <dt className="flex items-center gap-1.5 font-semibold text-gray-500">
        <Icon size={13} />
        {label}
      </dt>
      <dd className="mt-1 break-words leading-relaxed text-gray-200">{value}</dd>
    </div>
  )
}
