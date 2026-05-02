import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Boxes, AlertTriangle, Sparkles } from 'lucide-react'
import {
  getCraftConfig,
  loadCraftActiveMaterialStatsAdmin,
  type CraftActiveMaterialRow,
} from '@/app/actions/craft'
import { getLocale } from '@/lib/locale'
import { getLocalizedItemName } from '@/lib/item-names'
import {
  CRAFT_LOCATION_PRESETS,
  effectiveReturnRate,
} from '@/lib/albion-return-rates'

// 어드민 제작 대시보드 — 진행 중인 작업이 요구하는 재료 BoM 패널. 수요 통계가
// "어떤 장비가 청구됐나" 면 이 패널은 "지금 제작자가 무엇을 사야/빼야 하나" 에
// 답한다. queued + claimed 만 포함 — delivered 는 박스에 들어갔으니 재료가 이미
// 소비된 상태.
//
// 제작자가 자기 도시/포커스 입력 → effective return rate 계산 → 적용된 net 수치
// 표시. 미선택(none) 이면 길드 창고 출고 상한선 (gross). URL searchParams 로 동작:
//   ?bomLoc=royal_city|caerleon|hideout_t5|hideout_t8|none
//   ?bomFocus=on|off

interface AdminCraftMaterialsPanelProps {
  locationId: string | null
  focusUsed: boolean
  // 다른 searchParams 키 (예: statsMode) 를 BoM 토글 링크에서 유지하기 위함.
  preservedParams: Record<string, string>
}

export default async function AdminCraftMaterialsPanel({
  locationId,
  focusUsed,
  preservedParams,
}: AdminCraftMaterialsPanelProps) {
  const [config, t, locale] = await Promise.all([
    getCraftConfig(),
    getTranslations('adminCraft'),
    getLocale(),
  ])
  const tLoc = await getTranslations('craftRegear.location')

  const preset = locationId
    ? CRAFT_LOCATION_PRESETS.find((p) => p.id === locationId) ?? null
    : null
  const returnRatePct = preset
    ? effectiveReturnRate(preset.defaultReturnRatePct, focusUsed, config.focusBonusPct)
    : 0

  const { result, error } = await loadCraftActiveMaterialStatsAdmin({
    returnRatePct,
  })

  if (error || !result) {
    return (
      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-2">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('materialsTitle')}
        </h2>
        <p className="text-xs text-rose-300">{error ?? t('materialsError')}</p>
      </section>
    )
  }

  const isEmpty = result.materials.length === 0
  const grouped = groupByTier(result.materials)
  const isNet = result.appliedReturnPct > 0

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Boxes size={16} className="text-amber-400" />
          {t('materialsTitle')}
        </h2>
        <p className="text-xs text-gray-500 mt-1">
          {isNet
            ? t('materialsHintNet', {
                pct: result.appliedReturnPct.toFixed(1),
              })
            : t('materialsHint')}
        </p>
      </div>

      <ReturnRateSelector
        locationId={locationId}
        focusUsed={focusUsed}
        focusBonusPct={config.focusBonusPct}
        preservedParams={preservedParams}
        t={t}
        tLoc={tLoc}
      />

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <Pill tone="neutral">
          {t('materialsTaskCount', { count: result.taskCount })}
        </Pill>
        <Pill tone="dim">
          {t('materialsQueued', { count: result.queuedCount })}
        </Pill>
        <Pill tone="dim">
          {t('materialsClaimed', { count: result.claimedCount })}
        </Pill>
        {isNet && (
          <Pill tone="active">
            {t('materialsNetBadge', {
              pct: result.appliedReturnPct.toFixed(1),
            })}
          </Pill>
        )}
        {result.artifactCount > 0 && (
          <Pill tone="warn">
            <Sparkles size={11} className="text-amber-300" />
            {t('materialsArtifactWarn', { count: result.artifactCount })}
          </Pill>
        )}
        {result.unknownItemCount > 0 && (
          <Pill tone="warn">
            <AlertTriangle size={11} className="text-amber-300" />
            {t('materialsUnknownWarn', { count: result.unknownItemCount })}
          </Pill>
        )}
      </div>

      {isEmpty ? (
        <p className="text-gray-500 text-sm bg-gray-950 border border-gray-800 rounded-lg px-3 py-4 text-center">
          {t('materialsEmpty')}
        </p>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => (
            <div
              key={group.tier}
              className="bg-gray-950 border border-gray-800 rounded-lg p-3 space-y-2"
            >
              <p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">
                {tierLabel(t, group.tier)}
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {group.rows.map((row) => (
                  <li
                    key={row.uniqueName}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-gray-100">
                      {getLocalizedItemName(row.uniqueName, locale, null) ??
                        row.uniqueName}
                    </span>
                    <span className="tabular-nums text-amber-200 whitespace-nowrap">
                      {row.count.toLocaleString('en-US')}
                      <span className="text-gray-500 ml-1">
                        {t('materialsUnit')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

interface PillProps {
  tone: 'neutral' | 'dim' | 'warn' | 'active'
  children: React.ReactNode
}

function Pill({ tone, children }: PillProps) {
  const cls =
    tone === 'warn'
      ? 'bg-amber-500/10 text-amber-200 border-amber-500/30'
      : tone === 'active'
        ? 'bg-emerald-500/10 text-emerald-200 border-emerald-500/30'
        : tone === 'dim'
          ? 'bg-gray-950 text-gray-400 border-gray-800'
          : 'bg-gray-800 text-gray-100 border-gray-700'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border tabular-nums ${cls}`}
    >
      {children}
    </span>
  )
}

interface ReturnRateSelectorProps {
  locationId: string | null
  focusUsed: boolean
  focusBonusPct: number
  preservedParams: Record<string, string>
  t: Awaited<ReturnType<typeof getTranslations<'adminCraft'>>>
  tLoc: Awaited<ReturnType<typeof getTranslations<'craftRegear.location'>>>
}

// 제작자가 자기 도시·포커스 입력. URL searchParams 로 sticky — 새로고침해도 유지.
function ReturnRateSelector({
  locationId,
  focusUsed,
  focusBonusPct,
  preservedParams,
  t,
  tLoc,
}: ReturnRateSelectorProps) {
  // 'custom' 은 이 admin 패널에선 무의미 (자유 입력 폼이 없으므로) — 숨긴다.
  const presets = CRAFT_LOCATION_PRESETS.filter((p) => p.id !== 'custom')
  return (
    <div className="space-y-2 bg-gray-950 border border-gray-800 rounded-lg p-3">
      <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider">
        {t('materialsReturnRateLabel')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PresetLink
          targetLocation={null}
          focusUsed={focusUsed}
          preservedParams={preservedParams}
          active={locationId === null}
          label={t('materialsReturnNone')}
        />
        {presets.map((loc) => (
          <PresetLink
            key={loc.id}
            targetLocation={loc.id}
            focusUsed={focusUsed}
            preservedParams={preservedParams}
            active={loc.id === locationId}
            label={`${tLoc(loc.i18nKey)} (${loc.defaultReturnRatePct}%)`}
          />
        ))}
        <FocusToggleLink
          locationId={locationId}
          focusUsed={focusUsed}
          focusBonusPct={focusBonusPct}
          preservedParams={preservedParams}
          t={t}
        />
      </div>
    </div>
  )
}

function buildBomHref(
  preservedParams: Record<string, string>,
  targetLocation: string | null,
  targetFocus: boolean,
): string {
  const params = new URLSearchParams(preservedParams)
  if (targetLocation) params.set('bomLoc', targetLocation)
  else params.delete('bomLoc')
  if (targetFocus) params.set('bomFocus', 'on')
  else params.delete('bomFocus')
  const qs = params.toString()
  return qs ? `/admin/dashboard/craft?${qs}` : '/admin/dashboard/craft'
}

interface PresetLinkProps {
  targetLocation: string | null
  focusUsed: boolean
  preservedParams: Record<string, string>
  active: boolean
  label: string
}

function PresetLink({
  targetLocation,
  focusUsed,
  preservedParams,
  active,
  label,
}: PresetLinkProps) {
  return (
    <Link
      href={buildBomHref(preservedParams, targetLocation, focusUsed)}
      scroll={false}
      className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
        active
          ? 'bg-amber-500/20 text-amber-200 border-amber-500/30'
          : 'bg-gray-900 text-gray-300 border-gray-800 hover:text-gray-100'
      }`}
    >
      {label}
    </Link>
  )
}

interface FocusToggleLinkProps {
  locationId: string | null
  focusUsed: boolean
  focusBonusPct: number
  preservedParams: Record<string, string>
  t: Awaited<ReturnType<typeof getTranslations<'adminCraft'>>>
}

function FocusToggleLink({
  locationId,
  focusUsed,
  focusBonusPct,
  preservedParams,
  t,
}: FocusToggleLinkProps) {
  return (
    <Link
      href={buildBomHref(preservedParams, locationId, !focusUsed)}
      scroll={false}
      className={`px-2 py-1 rounded-md border text-[11px] transition-colors ${
        focusUsed
          ? 'bg-purple-500/20 text-purple-200 border-purple-500/30'
          : 'bg-gray-900 text-gray-300 border-gray-800 hover:text-gray-100'
      }`}
    >
      {focusUsed
        ? t('materialsFocusOn', { pct: focusBonusPct })
        : t('materialsFocusOff', { pct: focusBonusPct })}
    </Link>
  )
}

interface MaterialGroup {
  tier: number
  rows: CraftActiveMaterialRow[]
}

function groupByTier(rows: readonly CraftActiveMaterialRow[]): MaterialGroup[] {
  const map = new Map<number, CraftActiveMaterialRow[]>()
  for (const row of rows) {
    const arr = map.get(row.tier) ?? []
    arr.push(row)
    map.set(row.tier, arr)
  }
  return Array.from(map.entries())
    .map(([tier, rows]) => ({ tier, rows }))
    .sort((a, b) => b.tier - a.tier)
}

function tierLabel(
  t: Awaited<ReturnType<typeof getTranslations<'adminCraft'>>>,
  tier: number,
): string {
  if (tier <= 0) return t('materialsTierUnknown')
  return t('materialsTierLabel', { tier })
}
