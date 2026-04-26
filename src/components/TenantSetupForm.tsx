'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveTenantSetup } from '@/app/actions/onboard'
import {
  classifySlugIssue,
  displayNameFromSlug,
  isValidTenantSlug,
  type SlugValidationIssue,
} from '@/lib/tenant-slug'
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
  slugLabel: string
  slugHelp: string
  slugAutoUpdateHint: string
  slugPreviewPrefix: string
  slugDisplayNamePrefix: string
  slugIssueEmpty: string
  slugIssueTooShort: string
  slugIssueTooLong: string
  slugIssueInvalidChars: string
  slugIssueHyphenEdge: string
  slugIssueDoubleHyphen: string
  slugIssueReserved: string
  memberRoleLabel: string
  memberRoleHelp: string
  adminRoleLabel: string
  adminRoleHelp: string
  adminRoleLockoutWarn: string
  adminRoleAutoPreselectHint: string
  channelLabel: string
  channelHelp: string
  noChannel: string
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
  initialSlug: string
  rootDomain: string
  labels: Labels
}

function issueToMessage(issue: SlugValidationIssue, labels: Labels): string | null {
  switch (issue) {
    case 'empty':
      return labels.slugIssueEmpty
    case 'too_short':
      return labels.slugIssueTooShort
    case 'too_long':
      return labels.slugIssueTooLong
    case 'invalid_chars':
      return labels.slugIssueInvalidChars
    case 'leading_trailing_hyphen':
      return labels.slugIssueHyphenEdge
    case 'double_hyphen':
      return labels.slugIssueDoubleHyphen
    case 'reserved':
      return labels.slugIssueReserved
    default:
      return null
  }
}

// 초기 tenant 설정 폼 (위저드 1단계). slug 커스터마이즈 + Discord 역할/채널 선택.
// slug 는 bot-callback 에서 자동 생성된 값을 초기값으로 보여주고, 유저가 원하면
// 바꾼다. 저장 시 서버에서 isValidTenantSlug + UNIQUE 제약 재검증.
export default function TenantSetupForm({
  tenantId,
  roles,
  channels,
  initialSlug,
  rootDomain,
  labels,
}: Props) {
  const router = useRouter()
  const [slug, setSlug] = useState<string>(initialSlug)
  const [memberIds, setMemberIds] = useState<string[]>([])
  // 관리자 역할 self-lockout 방어: Discord 에서 ADMINISTRATOR/MANAGE_GUILD 권한을
  // 가진 역할을 초기값으로 프리체크해둔다. 유저는 조정 가능하지만 전부 해제하면
  // 제출이 막힌다 (missingAdminRoles).
  const autoPreselectAdmin = useMemo(
    () => roles.filter((r) => r.hasAdminPerm).map((r) => r.id),
    [roles],
  )
  const [adminIds, setAdminIds] = useState<string[]>(autoPreselectAdmin)
  const [channelId, setChannelId] = useState<string>('')
  // 시간대는 명시 선택 강제 — multi-tenant SaaS 라 KR 외 서버 길드도 정확하게
  // 잡히도록. 기본값 없이 빈 문자열로 시작, 미선택 시 제출 차단.
  const [timezone, setTimezone] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const hasAutoPreselect = autoPreselectAdmin.length > 0

  const slugIssue = useMemo<SlugValidationIssue>(() => classifySlugIssue(slug), [slug])
  const slugValid = useMemo<boolean>(() => isValidTenantSlug(slug), [slug])
  const slugIssueMessage = issueToMessage(slugIssue, labels)
  const slugDisplayName = useMemo<string>(() => displayNameFromSlug(slug), [slug])

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
    if (!slugValid) {
      setError(slugIssueMessage ?? labels.errorGeneric)
      return
    }
    if (memberIds.length === 0) {
      setError(labels.missingRoles)
      return
    }
    if (adminIds.length === 0) {
      setError(labels.missingAdminRoles)
      return
    }
    if (!timezone) {
      setError(labels.timezoneRequired)
      return
    }
    startTransition(async () => {
      const result = await saveTenantSetup({
        tenantId,
        slug,
        memberRoleIds: memberIds,
        adminRoleIds: adminIds,
        eventChannelId: channelId || null,
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
      <div className="space-y-2">
        <label htmlFor="tenant-slug" className="text-sm font-semibold text-white block">
          {labels.slugLabel}
        </label>
        <p className="text-xs text-gray-400">{labels.slugHelp}</p>
        <div className="flex items-stretch rounded-lg border border-white/10 bg-white/5 focus-within:ring-2 focus-within:ring-[#5865F2]">
          <input
            id="tenant-slug"
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
            autoComplete="off"
            spellCheck={false}
            maxLength={32}
            className="flex-1 bg-transparent px-3 py-2 text-sm text-white focus:outline-none"
          />
          <span className="flex items-center px-3 text-xs text-gray-400 border-l border-white/10 select-none">
            .{rootDomain}
          </span>
        </div>
        <p className="text-xs text-gray-500">
          {labels.slugPreviewPrefix}{' '}
          <span className="text-gray-300">
            https://{slug || '...'}.{rootDomain}
          </span>
        </p>
        {slugValid && slugDisplayName.length > 0 && (
          <p className="text-xs text-gray-500">
            {labels.slugDisplayNamePrefix}{' '}
            <span className="text-amber-400 font-semibold">⚔ {slugDisplayName}</span>
          </p>
        )}
        {slug.length > 0 && !slugValid && slugIssueMessage && (
          <p className="text-xs text-amber-400">{slugIssueMessage}</p>
        )}
        <p className="text-[11px] text-amber-300/80 leading-relaxed bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5">
          {labels.slugAutoUpdateHint}
        </p>
      </div>

      {/* 시간대는 사이트 전반(이벤트 시각/스트릭/Discord 알림 등) 동작에 직접
          영향이라 폼 상단(슬러그 다음)에 둔다. 하단에 두면 채널 설정 아래로 밀려
          사용자가 스크롤하지 않으면 못 본다는 피드백이 있어 위치 변경. */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">{labels.timezoneLabel}</legend>
        <p className="text-xs text-gray-400">{labels.timezoneHelp}</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
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
        <p className="text-xs text-amber-400">{labels.adminRoleLockoutWarn}</p>
        {hasAutoPreselect && (
          <p className="text-xs text-gray-500">{labels.adminRoleAutoPreselectHint}</p>
        )}
        <div className="mt-2 space-y-1 max-h-60 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-2">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-200 py-1 px-2 hover:bg-white/5 rounded">
              <input
                type="checkbox"
                checked={adminIds.includes(r.id)}
                onChange={() => toggle(r.id, adminIds, setAdminIds)}
                className="accent-[#5865F2]"
              />
              <span className={r.hasAdminPerm ? 'text-amber-200' : undefined}>
                {r.name}
                {r.hasAdminPerm && <span className="ml-1 text-xs text-amber-500">★</span>}
              </span>
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
        disabled={isPending || !slugValid}
        className="w-full rounded-lg bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-60 text-white text-sm font-semibold py-2.5"
      >
        {isPending ? labels.savingButton : labels.nextButton}
      </button>
    </form>
  )
}
