'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTenantSetup } from '@/app/actions/onboard'

interface DiscordRoleOption {
  id: string
  name: string
  color: number
  position: number
}

interface DiscordChannelOption {
  id: string
  name: string
  position: number
  parent_id: string | null
}

interface Labels {
  memberRoleLabel: string
  memberRoleHelp: string
  adminRoleLabel: string
  adminRoleHelp: string
  channelLabel: string
  channelHelp: string
  noChannel: string
  nextButton: string
  savingButton: string
  errorGeneric: string
  missingRoles: string
}

interface Props {
  tenantId: string
  roles: DiscordRoleOption[]
  channels: DiscordChannelOption[]
  labels: Labels
}

// 초기 tenant 설정 폼 (위저드 1단계). 체크박스 기반 다중 선택 (admin 설정 페이지
// 컨벤션과 동일). 저장 성공 시 2단계 (알비온 서버/홈 길드) 로 이동한다.
export default function TenantSetupForm({ tenantId, roles, channels, labels }: Props) {
  const router = useRouter()
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [adminIds, setAdminIds] = useState<string[]>([])
  const [channelId, setChannelId] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const toggle = (
    id: string,
    current: string[],
    setter: (v: string[]) => void,
  ) => {
    setter(current.includes(id) ? current.filter((x) => x !== id) : [...current, id])
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (memberIds.length === 0) {
      setError(labels.missingRoles)
      return
    }
    startTransition(async () => {
      const result = await saveTenantSetup({
        tenantId,
        memberRoleIds: memberIds,
        adminRoleIds: adminIds,
        eventChannelId: channelId || null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/onboard/setup/${tenantId}/albion`)
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">{labels.memberRoleLabel}</legend>
        <p className="text-xs text-gray-400">{labels.memberRoleHelp}</p>
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-200 py-1 px-2 hover:bg-white/5 rounded">
              <input
                type="checkbox"
                checked={memberIds.includes(r.id)}
                onChange={() => toggle(r.id, memberIds, setMemberIds)}
                className="accent-[#5865F2]"
              />
              <span>{r.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">{labels.adminRoleLabel}</legend>
        <p className="text-xs text-gray-400">{labels.adminRoleHelp}</p>
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-200 py-1 px-2 hover:bg-white/5 rounded">
              <input
                type="checkbox"
                checked={adminIds.includes(r.id)}
                onChange={() => toggle(r.id, adminIds, setAdminIds)}
                className="accent-[#5865F2]"
              />
              <span>{r.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="channel" className="text-sm font-semibold text-white block">
          {labels.channelLabel}
        </label>
        <p className="text-xs text-gray-400">{labels.channelHelp}</p>
        <select
          id="channel"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#5865F2]"
        >
          <option value="">{labels.noChannel}</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              #{c.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-sm font-semibold py-2.5"
      >
        {isPending ? labels.savingButton : labels.nextButton}
      </button>
    </form>
  )
}
