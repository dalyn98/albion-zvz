'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ChevronDown, ShieldCheck } from 'lucide-react'
import { saveTenantRewards } from '@/app/actions/onboard'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { isValidRoleRegearPayoutRate } from '@/lib/regear-payout'

interface Labels {
  quickStartTitle: string
  quickStartDescription: string
  supportSectionTitle: string
  supportSectionDescription: string
  supportRequiredError: string
  supportUnsupportedLabel: string
  supportUnsupportedHint: string
  supportSupportedLabel: string
  supportSupportedHint: string
  participationCloseoutSectionTitle: string
  participationCloseoutSectionDescription: string
  participationCloseoutRequiredError: string
  participationCloseoutAutomaticLabel: string
  participationCloseoutAutomaticHint: string
  participationCloseoutManualLabel: string
  participationCloseoutManualHint: string
  fulfillmentSectionTitle: string
  fulfillmentRequiredError: string
  fulfillmentSilverLabel: string
  fulfillmentSilverHint: string
  fulfillmentCraftedLabel: string
  fulfillmentCraftedHint: string
  advancedSettingsLabel: string
  advancedSettingsDescription: string
  rewardsRoleColumn: string
  rewardsSilverColumn: string
  rewardsPayoutColumn: string
  rewardsSilverHelp: string
  rewardsPayoutHelp: string
  rewardsErrorInvalidSilver: string
  rewardsErrorInvalidPayout: string
  policySectionTitle: string
  policySectionDescription: string
  policyAutoLabel: string
  policyAutoHint: string
  policyCraftLabel: string
  policyCraftHint: string
  policyVerifyLabel: string
  policyVerifyHint: string
  policyPayoutLabel: string
  policyPayoutHint: string
  policyPayoutSuffix: string
  policyErrorInvalidPayout: string
  eventsSectionTitle: string
  eventsSectionDescription: string
  eventsAutoStartLabel: string
  eventsAutoStartHint: string
  rewardsSectionTitle: string
  rewardsSectionDescription: string
  finishButton: string
  finishingButton: string
  errorGeneric: string
}

interface InitialReward {
  role_name: string
  silver: number
  payout_rate_percent: number
}

interface InitialPolicy {
  regearSupportEnabled: boolean | null
  autoRegearEnabled: boolean
  craftRegearEnabled: boolean | null
  regearRequireVerification: boolean
  regearPayoutRatePercent: number
  participationAutoCloseoutEnabled: boolean | null
}

interface Props {
  tenantId: string
  initial: InitialReward[]
  initialPolicy: InitialPolicy
  labels: Labels
}

// 위저드 3단계: 리기어 정책 토글 + 역할별 기본 실버 + 필수 이벤트 운영 시작 안내.
// 저장 성공 시 tenant
// 가 active 로 flip 되고 서버가 subdomain hop 용 redirectUrl 을 돌려준다 —
// cross-host 이동으로 서브도메인 쿠키가 /api/auth/finish 에서 심어지도록
// 한다.
export default function TenantRewardsSetupForm({
  tenantId,
  initial,
  initialPolicy,
  labels,
}: Props) {
  const router = useRouter()
  const tRole = useTranslations('slotRole')
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const r of initial) init[r.role_name] = String(r.silver)
    return init
  })
  const [rateValues, setRateValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const r of initial) init[r.role_name] = String(r.payout_rate_percent)
    return init
  })
  const [regearSupportEnabled, setRegearSupportEnabled] = useState<boolean | null>(
    initialPolicy.regearSupportEnabled,
  )
  const [autoRegearEnabled, setAutoRegearEnabled] = useState(initialPolicy.autoRegearEnabled)
  const [craftRegearEnabled, setCraftRegearEnabled] = useState<boolean | null>(
    initialPolicy.craftRegearEnabled,
  )
  const [regearRequireVerification, setRegearRequireVerification] = useState(
    initialPolicy.regearRequireVerification,
  )
  const [payoutRateRaw, setPayoutRateRaw] = useState(String(initialPolicy.regearPayoutRatePercent))
  const [participationAutoCloseoutEnabled, setParticipationAutoCloseoutEnabled] =
    useState<boolean | null>(initialPolicy.participationAutoCloseoutEnabled)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSilverChange = (role_name: string, raw: string) => {
    if (raw === '' || /^\d+$/.test(raw)) {
      setValues((prev) => ({ ...prev, [role_name]: raw }))
    }
  }

  const handleRolePayoutChange = (role_name: string, raw: string) => {
    if (raw === '' || /^\d+$/.test(raw)) {
      setRateValues((prev) => ({ ...prev, [role_name]: raw }))
    }
  }

  const handlePayoutChange = (raw: string) => {
    if (raw === '' || /^\d+$/.test(raw)) {
      setPayoutRateRaw(raw)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (regearSupportEnabled === null) {
      setError(labels.supportRequiredError)
      return
    }
    if (regearSupportEnabled && craftRegearEnabled === null) {
      setError(labels.fulfillmentRequiredError)
      return
    }
    if (participationAutoCloseoutEnabled === null) {
      setError(labels.participationCloseoutRequiredError)
      return
    }

    const rewards: InitialReward[] = []
    const payoutRate = payoutRateRaw === '' ? 0 : Number(payoutRateRaw)
    if (regearSupportEnabled) {
      for (const r of initial) {
        const raw = values[r.role_name] ?? ''
        const silver = raw === '' ? 0 : Number(raw)
        if (!Number.isInteger(silver) || silver < 0) {
          setError(labels.rewardsErrorInvalidSilver)
          return
        }
        const payoutRatePercent = Number(rateValues[r.role_name] ?? '')
        if (!isValidRoleRegearPayoutRate(payoutRatePercent)) {
          setError(labels.rewardsErrorInvalidPayout)
          return
        }
        rewards.push({
          role_name: r.role_name,
          silver,
          payout_rate_percent: payoutRatePercent,
        })
      }
      if (!Number.isInteger(payoutRate) || payoutRate < 1 || payoutRate > 100) {
        setError(labels.policyErrorInvalidPayout)
        return
      }
    }

    startTransition(async () => {
      const res = await saveTenantRewards({
        tenantId,
        rewards,
        policy: {
          regearSupportEnabled,
          autoRegearEnabled,
          craftRegearEnabled,
          regearRequireVerification,
          regearPayoutRatePercent: payoutRate,
          participationAutoCloseoutEnabled,
        },
      })
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl
        return
      }
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <section className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-emerald-200">
            <ShieldCheck size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-emerald-100">{labels.quickStartTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-emerald-100/70">
              {labels.quickStartDescription}
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <header>
          <h2 className="text-base font-semibold text-white">
            {labels.supportSectionTitle}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {labels.supportSectionDescription}
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            checked={regearSupportEnabled === false}
            onChange={() => setRegearSupportEnabled(false)}
            label={labels.supportUnsupportedLabel}
            hint={labels.supportUnsupportedHint}
          />
          <ChoiceCard
            checked={regearSupportEnabled === true}
            onChange={() => setRegearSupportEnabled(true)}
            label={labels.supportSupportedLabel}
            hint={labels.supportSupportedHint}
          />
        </div>
        {regearSupportEnabled && (
          <fieldset className="space-y-2 border-t border-white/10 pt-3">
            <legend className="text-sm font-semibold text-white">
              {labels.fulfillmentSectionTitle}
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                checked={craftRegearEnabled === false}
                onChange={() => setCraftRegearEnabled(false)}
                label={labels.fulfillmentSilverLabel}
                hint={labels.fulfillmentSilverHint}
              />
              <ChoiceCard
                checked={craftRegearEnabled === true}
                onChange={() => setCraftRegearEnabled(true)}
                label={labels.fulfillmentCraftedLabel}
                hint={labels.fulfillmentCraftedHint}
              />
            </div>
          </fieldset>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
        <header>
          <h2 className="text-base font-semibold text-white">
            {labels.participationCloseoutSectionTitle}
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            {labels.participationCloseoutSectionDescription}
          </p>
        </header>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            checked={participationAutoCloseoutEnabled === true}
            onChange={() => setParticipationAutoCloseoutEnabled(true)}
            label={labels.participationCloseoutAutomaticLabel}
            hint={labels.participationCloseoutAutomaticHint}
          />
          <ChoiceCard
            checked={participationAutoCloseoutEnabled === false}
            onChange={() => setParticipationAutoCloseoutEnabled(false)}
            label={labels.participationCloseoutManualLabel}
            hint={labels.participationCloseoutManualHint}
          />
        </div>
      </section>

      <details
        data-onboard-advanced-settings
        className="group overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]"
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">
              {labels.advancedSettingsLabel}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              {labels.advancedSettingsDescription}
            </span>
          </span>
          <ChevronDown
            size={16}
            className="flex-shrink-0 text-gray-500 transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="space-y-8 border-t border-white/10 p-4">
          {regearSupportEnabled && (
          <section className="space-y-3">
            <header>
              <h2 className="text-base font-semibold text-white">{labels.policySectionTitle}</h2>
              <p className="text-xs text-gray-500 mt-1">{labels.policySectionDescription}</p>
            </header>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <ToggleRow
                checked={autoRegearEnabled}
                onChange={setAutoRegearEnabled}
                label={labels.policyAutoLabel}
                hint={labels.policyAutoHint}
              />
              <ToggleRow
                checked={regearRequireVerification}
                onChange={setRegearRequireVerification}
                label={labels.policyVerifyLabel}
                hint={labels.policyVerifyHint}
              />
              <div className="flex items-start gap-3 rounded-lg p-2 -mx-2">
                <span className="flex-1">
                  <span className="block text-sm text-white font-semibold">
                    {labels.policyPayoutLabel}
                  </span>
                  <span className="block text-[11px] text-gray-500 mt-0.5">
                    {labels.policyPayoutHint}
                  </span>
                </span>
                <span className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={payoutRateRaw}
                    onChange={(e) => handlePayoutChange(e.target.value)}
                    placeholder="100"
                    aria-label={labels.policyPayoutLabel}
                    className="w-20 bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded px-2 py-1 text-right text-white font-mono text-sm outline-none"
                  />
                  <span className="text-xs text-gray-500">{labels.policyPayoutSuffix}</span>
                </span>
              </div>
            </div>
          </section>
          )}

          <section className="space-y-3">
            <header>
              <h2 className="text-base font-semibold text-white">{labels.eventsSectionTitle}</h2>
              <p className="text-xs text-gray-500 mt-1">{labels.eventsSectionDescription}</p>
            </header>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <div className="flex items-start gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] p-3">
                <ShieldCheck size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                <span>
                  <span className="block text-sm font-semibold text-emerald-100">
                    {labels.eventsAutoStartLabel}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-emerald-100/65">
                    {labels.eventsAutoStartHint}
                  </span>
                </span>
              </div>
            </div>
          </section>

          {regearSupportEnabled && (
          <section className="space-y-3">
            <header>
              <h2 className="text-base font-semibold text-white">{labels.rewardsSectionTitle}</h2>
              <p className="text-xs text-gray-500 mt-1">{labels.rewardsSectionDescription}</p>
            </header>
            <div className="space-y-3 sm:hidden">
              {initial.map((r) => {
                const roleLabel = translateSlotRole(r.role_name, tRole)
                const silverInputId = `onboard-reward-silver-${r.role_name}`
                const payoutInputId = `onboard-reward-payout-${r.role_name}`
                return (
                  <article
                    key={r.role_name}
                    className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-3"
                  >
                    <h3 className="font-mono text-sm font-semibold text-white">{roleLabel}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <label htmlFor={silverInputId} className="space-y-1">
                        <span className="block text-xs font-semibold text-gray-400">
                          {labels.rewardsSilverColumn}
                        </span>
                        <input
                          id={silverInputId}
                          type="text"
                          inputMode="numeric"
                          value={values[r.role_name] ?? ''}
                          onChange={(e) => handleSilverChange(r.role_name, e.target.value)}
                          placeholder="0"
                          className="w-full min-h-10 bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded px-2 py-1 text-right text-white font-mono text-sm outline-none"
                        />
                      </label>
                      <label htmlFor={payoutInputId} className="space-y-1">
                        <span className="block text-xs font-semibold text-gray-400">
                          {labels.rewardsPayoutColumn}
                        </span>
                        <span className="flex items-center gap-1">
                          <input
                            id={payoutInputId}
                            type="text"
                            inputMode="numeric"
                            value={rateValues[r.role_name] ?? ''}
                            onChange={(e) => handleRolePayoutChange(r.role_name, e.target.value)}
                            placeholder="100"
                            className="min-h-10 min-w-0 flex-1 bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded px-2 py-1 text-right text-white font-mono text-sm outline-none"
                          />
                          <span className="text-xs text-gray-500">%</span>
                        </span>
                      </label>
                    </div>
                  </article>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-white/10 sm:block">
              <table className="min-w-[560px] w-full text-sm">
                <thead className="bg-white/5">
                  <tr>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {labels.rewardsRoleColumn}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {labels.rewardsSilverColumn}
                    </th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      {labels.rewardsPayoutColumn}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {initial.map((r) => (
                    <tr key={r.role_name}>
                      <td className="px-3 py-2 text-white font-mono text-xs">
                        {translateSlotRole(r.role_name, tRole)}
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={values[r.role_name] ?? ''}
                          onChange={(e) => handleSilverChange(r.role_name, e.target.value)}
                          placeholder="0"
                          aria-label={`${translateSlotRole(r.role_name, tRole)} ${labels.rewardsSilverColumn}`}
                          className="w-32 min-h-10 bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded px-2 py-1 text-right text-white font-mono text-sm outline-none"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rateValues[r.role_name] ?? ''}
                            onChange={(e) => handleRolePayoutChange(r.role_name, e.target.value)}
                            placeholder="100"
                            aria-label={`${translateSlotRole(r.role_name, tRole)} ${labels.rewardsPayoutColumn}`}
                            className="w-16 min-h-10 bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded px-2 py-1 text-right text-white font-mono text-sm outline-none"
                          />
                          <span className="text-xs text-gray-500">%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-1 text-xs text-gray-500">
              <p>{labels.rewardsSilverHelp}</p>
              <p>{labels.rewardsPayoutHelp}</p>
            </div>
          </section>
          )}
        </div>
      </details>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-sm font-semibold py-2.5"
      >
        {isPending ? labels.finishingButton : labels.finishButton}
      </button>
    </form>
  )
}

interface ChoiceCardProps {
  checked: boolean
  onChange: () => void
  label: string
  hint: string
}

function ChoiceCard({ checked, onChange, label, hint }: ChoiceCardProps) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
        checked
          ? 'border-[#5865F2]/70 bg-[#5865F2]/10'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20'
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-[#5865F2]"
      />
      <span>
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-[11px] text-gray-500">{hint}</span>
      </span>
    </label>
  )
}

interface ToggleRowProps {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint: string
}

function ToggleRow({ checked, onChange, label, hint }: ToggleRowProps) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg p-2 -mx-2 hover:bg-white/[0.04] transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-[#5865F2]"
      />
      <span className="flex-1">
        <span className="block text-sm text-white font-semibold">{label}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>
      </span>
    </label>
  )
}
