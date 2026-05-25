'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveTenantRewards } from '@/app/actions/onboard'
import { translateSlotRole } from '@/lib/slot-role-i18n'

interface Labels {
  rewardsRoleColumn: string
  rewardsSilverColumn: string
  rewardsSilverHelp: string
  rewardsErrorInvalidSilver: string
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
}

interface InitialPolicy {
  autoRegearEnabled: boolean
  craftRegearEnabled: boolean
  regearRequireVerification: boolean
  regearPayoutRatePercent: number
  eventsAutoStartEnabled: boolean
}

interface Props {
  tenantId: string
  initial: InitialReward[]
  initialPolicy: InitialPolicy
  labels: Labels
}

// 위저드 3단계: 리기어 정책 토글 + 역할별 기본 실버 + 이벤트 자동 시작. 모든
// 항목은 admin 설정 페이지에 동일하게 존재해 추후 변경 가능. 저장 성공 시 tenant
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
  const [autoRegearEnabled, setAutoRegearEnabled] = useState(initialPolicy.autoRegearEnabled)
  const [craftRegearEnabled, setCraftRegearEnabled] = useState(initialPolicy.craftRegearEnabled)
  const [regearRequireVerification, setRegearRequireVerification] = useState(
    initialPolicy.regearRequireVerification,
  )
  const [payoutRateRaw, setPayoutRateRaw] = useState(String(initialPolicy.regearPayoutRatePercent))
  const [eventsAutoStartEnabled, setEventsAutoStartEnabled] = useState(
    initialPolicy.eventsAutoStartEnabled,
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSilverChange = (role_name: string, raw: string) => {
    if (raw === '' || /^\d+$/.test(raw)) {
      setValues((prev) => ({ ...prev, [role_name]: raw }))
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

    const rewards: InitialReward[] = []
    for (const r of initial) {
      const raw = values[r.role_name] ?? ''
      const silver = raw === '' ? 0 : Number(raw)
      if (!Number.isInteger(silver) || silver < 0) {
        setError(labels.rewardsErrorInvalidSilver)
        return
      }
      rewards.push({ role_name: r.role_name, silver })
    }

    const payoutRate = payoutRateRaw === '' ? 0 : Number(payoutRateRaw)
    if (!Number.isInteger(payoutRate) || payoutRate < 1 || payoutRate > 100) {
      setError(labels.policyErrorInvalidPayout)
      return
    }

    startTransition(async () => {
      const res = await saveTenantRewards({
        tenantId,
        rewards,
        policy: {
          autoRegearEnabled,
          craftRegearEnabled,
          regearRequireVerification,
          regearPayoutRatePercent: payoutRate,
          eventsAutoStartEnabled,
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
    <form onSubmit={handleSubmit} className="space-y-8">
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
            checked={craftRegearEnabled}
            onChange={setCraftRegearEnabled}
            label={labels.policyCraftLabel}
            hint={labels.policyCraftHint}
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
                className="w-20 bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded px-2 py-1 text-right text-white font-mono text-sm outline-none"
              />
              <span className="text-xs text-gray-500">{labels.policyPayoutSuffix}</span>
            </span>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold text-white">{labels.eventsSectionTitle}</h2>
          <p className="text-xs text-gray-500 mt-1">{labels.eventsSectionDescription}</p>
        </header>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <ToggleRow
            checked={eventsAutoStartEnabled}
            onChange={setEventsAutoStartEnabled}
            label={labels.eventsAutoStartLabel}
            hint={labels.eventsAutoStartHint}
          />
        </div>
      </section>

      <section className="space-y-3">
        <header>
          <h2 className="text-base font-semibold text-white">{labels.rewardsSectionTitle}</h2>
          <p className="text-xs text-gray-500 mt-1">{labels.rewardsSectionDescription}</p>
        </header>
        <div className="rounded-lg border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {labels.rewardsRoleColumn}
                </th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {labels.rewardsSilverColumn}
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
                      className="w-32 bg-white/5 border border-white/10 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30 rounded px-2 py-1 text-right text-white font-mono text-sm outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">{labels.rewardsSilverHelp}</p>
      </section>

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
