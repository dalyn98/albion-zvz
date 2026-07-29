'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { saveTenantSetup } from '@/app/actions/onboard'
import {
  TENANT_TIMEZONE_OPTIONS,
  getUtcOffsetLabel,
  type TenantTimezoneOption,
} from '@/lib/timezone'

interface DiscordRoleOption {
  id: string
  name: string
  color: number
  position: number
  hasAdminPerm: boolean
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
  adminRoleLockoutWarn: string
  adminRoleAutoPreselectHint: string
  roleSearchPlaceholder: string
  roleSearchNoResults: string
  channelLabel: string
  channelHelp: string
  channelPermissionTitle: string
  channelPermissionBody: string
  noChannel: string
  missingEventChannel: string
  timezoneLabel: string
  timezoneHelp: string
  timezoneRequired: string
  timezone_kr: string
  timezone_eu: string
  timezone_na: string
  timezone_sa: string
  nextButton: string
  savingButton: string
  errorGeneric: string
  missingRoles: string
  missingAdminRoles: string
}

interface Props {
  tenantId: string
  roles: DiscordRoleOption[]
  channels: DiscordChannelOption[]
  labels: Labels
}

// 초기 tenant 설정 폼 (위저드 1단계). Discord 역할/채널/시간대만 받는다.
// 서브도메인 slug 는 이 단계에서 입력받지 않는다 — 다음 단계의 알비온 홈 길드
// 인증 시 길드 이름 기반으로 자동 갱신되며, skip 흐름이라면 봇 설치 시 자동
// 생성된 임시 slug 가 그대로 유지된다.
export default function TenantSetupForm({ tenantId, roles, channels, labels }: Props) {
  const router = useRouter()
  const [memberIds, setMemberIds] = useState<string[]>([])
  // 관리자 역할 self-lockout 방어: Discord 에서 ADMINISTRATOR/MANAGE_GUILD 권한을
  // 가진 역할을 초기값으로 프리체크해둔다. 유저는 조정 가능하지만 전부 해제하면
  // 제출이 막힌다 (missingAdminRoles).
  const autoPreselectAdmin = useMemo(
    () => roles.filter((r) => r.hasAdminPerm).map((r) => r.id),
    [roles],
  )
  const [adminIds, setAdminIds] = useState<string[]>(autoPreselectAdmin)
  const [roleQuery, setRoleQuery] = useState('')
  const [channelId, setChannelId] = useState<string>('')
  // 시간대는 명시 선택 강제 — multi-tenant SaaS 라 KR 외 서버 길드도 정확하게
  // 잡히도록. 기본값 없이 빈 문자열로 시작, 미선택 시 제출 차단.
  const [timezone, setTimezone] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const hasAutoPreselect = autoPreselectAdmin.length > 0
  const filteredRoles = useMemo(() => {
    const query = roleQuery.normalize('NFKC').trim().toLocaleLowerCase()
    if (!query) return roles
    return roles.filter((role) => role.name.normalize('NFKC').toLocaleLowerCase().includes(query))
  }, [roleQuery, roles])

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (memberIds.length === 0) {
      setError(labels.missingRoles)
      return
    }
    if (adminIds.length === 0) {
      setError(labels.missingAdminRoles)
      return
    }
    if (!channelId) {
      setError(labels.missingEventChannel)
      return
    }
    if (!timezone) {
      setError(labels.timezoneRequired)
      return
    }
    startTransition(async () => {
      const result = await saveTenantSetup({
        tenantId,
        memberRoleIds: memberIds,
        adminRoleIds: adminIds,
        eventChannelId: channelId,
        timezone,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/onboard/setup/${tenantId}/albion`)
    })
  }

  const timezoneLabelFor = (option: TenantTimezoneOption): string => {
    if (option.id === 'kr') return labels.timezone_kr
    if (option.id === 'eu') return labels.timezone_eu
    if (option.id === 'na') return labels.timezone_na
    return labels.timezone_sa
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* 시간대는 사이트 전반(이벤트 시각/스트릭/Discord 알림 등) 동작에 직접
          영향이라 폼 상단에 둔다. 하단에 두면 채널 설정 아래로 밀려
          사용자가 스크롤하지 않으면 못 본다는 피드백이 있어 위치 변경. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">{labels.timezoneLabel}</legend>
        <p className="text-xs text-gray-400">{labels.timezoneHelp}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TENANT_TIMEZONE_OPTIONS.map((option) => (
            <label
              key={option.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer transition-colors ${
                timezone === option.iana
                  ? 'border-[#5865F2] bg-[#5865F2]/10 text-white'
                  : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
              }`}
            >
              <input
                type="radio"
                name="tenant-timezone"
                value={option.iana}
                checked={timezone === option.iana}
                onChange={() => setTimezone(option.iana)}
                className="accent-[#5865F2]"
              />
              <span className="flex-1">{timezoneLabelFor(option)}</span>
              <span className="text-xs font-mono text-[#5865F2]/80">
                {getUtcOffsetLabel(option.iana)}
              </span>
              <span className="text-xs text-gray-500">{option.iana}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="onboard-role-search" className="sr-only">
          {labels.roleSearchPlaceholder}
        </label>
        <div className="relative">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
          />
          <input
            id="onboard-role-search"
            type="search"
            value={roleQuery}
            onChange={(event) => setRoleQuery(event.target.value)}
            placeholder={labels.roleSearchPlaceholder}
            className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#5865F2]/60 focus:ring-2 focus:ring-[#5865F2]/30"
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">{labels.memberRoleLabel}</legend>
        <p className="text-xs text-gray-400">{labels.memberRoleHelp}</p>
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {filteredRoles.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-2 text-sm text-gray-200 py-1 px-2 hover:bg-white/5 rounded"
            >
              <input
                type="checkbox"
                checked={memberIds.includes(r.id)}
                onChange={() =>
                  setMemberIds((prev) =>
                    prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id],
                  )
                }
                className="accent-[#5865F2]"
              />
              <span>{r.name}</span>
            </label>
          ))}
          {filteredRoles.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-gray-500">
              {labels.roleSearchNoResults}
            </p>
          )}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">{labels.adminRoleLabel}</legend>
        <p className="text-xs text-gray-400">{labels.adminRoleHelp}</p>
        <p className="text-xs text-amber-400">{labels.adminRoleLockoutWarn}</p>
        {hasAutoPreselect && (
          <p className="text-xs text-gray-500">{labels.adminRoleAutoPreselectHint}</p>
        )}
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {filteredRoles.map((r) => (
            <label
              key={r.id}
              className="flex items-center gap-2 text-sm text-gray-200 py-1 px-2 hover:bg-white/5 rounded"
            >
              <input
                type="checkbox"
                checked={adminIds.includes(r.id)}
                onChange={() =>
                  setAdminIds((prev) =>
                    prev.includes(r.id) ? prev.filter((x) => x !== r.id) : [...prev, r.id],
                  )
                }
                className="accent-[#5865F2]"
              />
              <span className={r.hasAdminPerm ? 'text-amber-200' : undefined}>
                {r.name}
                {r.hasAdminPerm && <span className="ml-1 text-xs text-amber-500">★</span>}
              </span>
            </label>
          ))}
          {filteredRoles.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-gray-500">
              {labels.roleSearchNoResults}
            </p>
          )}
        </div>
      </fieldset>

      <div className="space-y-2">
        <label htmlFor="channel" className="text-sm font-semibold text-white block">
          {labels.channelLabel}
        </label>
        <p className="text-xs text-gray-400">{labels.channelHelp}</p>
        <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/80">
          <span className="font-semibold text-amber-100">{labels.channelPermissionTitle}</span>
          <span className="mt-0.5 block">{labels.channelPermissionBody}</span>
        </div>
        <select
          id="channel"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          required
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
