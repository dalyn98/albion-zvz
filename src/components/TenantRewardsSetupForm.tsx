'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { saveTenantRewards } from '@/app/actions/onboard'
import { translateSlotRole } from '@/lib/slot-role-i18n'

interface Labels {
  rewardsRoleColumn: string
  rewardsSilverColumn: string
  rewardsSilverHelp: string
  rewardsErrorInvalidSilver: string
  finishButton: string
  finishingButton: string
  errorGeneric: string
}

interface InitialReward {
  role_name: string
  silver: number
}

interface Props {
  tenantId: string
  initial: InitialReward[]
  labels: Labels
}

// 위저드 3단계: 역할별 기본 리기어 실버. 숫자 입력. 0 = 이 역할은 리기어 차단
// (기존 semantic 과 일치). 저장 성공 시 tenant 가 active 로 flip 되고 서버가
// subdomain hop 용 redirectUrl 을 돌려준다 — window.location 으로 이동해
// 서브도메인 쿠키가 /api/auth/finish 에서 심어지도록 한다.
export default function TenantRewardsSetupForm({ tenantId, initial, labels }: Props) {
  const tRole = useTranslations('slotRole')
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const r of initial) init[r.role_name] = String(r.silver)
    return init
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleChange = (role_name: string, raw: string) => {
    // 숫자 + 빈값만 허용. 빈 값은 0 으로 해석(submit 시).
    if (raw === '' || /^\d+$/.test(raw)) {
      setValues((prev) => ({ ...prev, [role_name]: raw }))
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

    startTransition(async () => {
      const res = await saveTenantRewards({ tenantId, rewards })
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.redirectUrl) {
        // 서브도메인으로 크로스-오리진 이동이므로 Next 라우터 대신 location 교체.
        window.location.href = res.redirectUrl
        return
      }
      // redirectUrl 이 없다면 fallback — 완료 처리는 됐으니 최소한 재로드로
      // 세션 갱신 효과를 본다.
      window.location.reload()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
                <td className="px-3 py-2 text-white font-mono text-xs">{translateSlotRole(r.role_name, tRole)}</td>
                <td className="px-3 py-1.5 text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={values[r.role_name] ?? ''}
                    onChange={(e) => handleChange(r.role_name, e.target.value)}
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
