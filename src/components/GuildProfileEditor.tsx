'use client'

import { useId, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Check } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import {
  ACCENT_COLORS,
  ACCENT_CLASS_MAP,
  RECRUITMENT_STATUSES,
  type AccentColor,
  type RecruitmentStatus,
} from '@/lib/guild-profile-config'
import { toYoutubeEmbedUrl } from '@/lib/youtube-embed'
import { toDiscordInviteUrl } from '@/lib/discord-invite-url'
import { useReportDirty } from './UnsavedChangesProvider'

const DESCRIPTION_MAX_LENGTH = 500
const URL_MAX_LENGTH = 500

interface Props {
  initialDescription: string
  initialAccentColor: AccentColor
  initialRecruitmentStatus: RecruitmentStatus
  initialDiscordInviteUrl: string
  initialYoutubeUrl: string
}

export default function GuildProfileEditor({
  initialDescription,
  initialAccentColor,
  initialRecruitmentStatus,
  initialDiscordInviteUrl,
  initialYoutubeUrl,
}: Props) {
  const t = useTranslations('adminGuildProfile')
  const tCommon = useTranslations('common')
  const router = useRouter()

  const [description, setDescription] = useState(initialDescription)
  const [accentColor, setAccentColor] = useState<AccentColor>(initialAccentColor)
  const [recruitmentStatus, setRecruitmentStatus] = useState<RecruitmentStatus>(
    initialRecruitmentStatus,
  )
  const [discordInviteUrl, setDiscordInviteUrl] = useState(initialDiscordInviteUrl)
  const [youtubeUrl, setYoutubeUrl] = useState(initialYoutubeUrl)
  // 저장 성공 시 saved* 를 즉시 새 값으로 sync — router.refresh 가 새 prop 을
  // 가져오기 전까지의 false-alarm 가드 방지.
  const [savedDescription, setSavedDescription] = useState(initialDescription)
  const [savedDiscordInviteUrl, setSavedDiscordInviteUrl] = useState(initialDiscordInviteUrl)
  const [savedYoutubeUrl, setSavedYoutubeUrl] = useState(initialYoutubeUrl)

  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()

  const descId = useId()
  const urlId = useId()
  const youtubeId = useId()

  const descTooLong = description.length > DESCRIPTION_MAX_LENGTH
  const urlTooLong = discordInviteUrl.length > URL_MAX_LENGTH
  const youtubeTooLong = youtubeUrl.length > URL_MAX_LENGTH
  // 저장 전 클라이언트 사전 검증 — 서버 액션도 같은 sanitizer 로 막지만, 잘못된
  // URL 을 미리 회색 처리해 어드민이 즉시 인지할 수 있게 한다. 빈 값은 OK
  // (위젯 숨김 의도).
  const youtubeInvalid =
    youtubeUrl.trim().length > 0 && toYoutubeEmbedUrl(youtubeUrl) === null
  const discordInviteInvalid =
    discordInviteUrl.trim().length > 0 && toDiscordInviteUrl(discordInviteUrl) === null
  const descDirty = description !== savedDescription
  const urlDirty = discordInviteUrl !== savedDiscordInviteUrl
  const youtubeDirty = youtubeUrl !== savedYoutubeUrl
  useReportDirty('guild-profile-editor', descDirty || urlDirty || youtubeDirty)

  const save = (
    label: string,
    key: Parameters<typeof updateAppSetting>[0],
    value: string,
  ) => {
    setError('')
    setSavingKey(label)
    setSavedKey(null)
    startTransition(async () => {
      const normalizedValue =
        key === 'guild_profile_discord_invite_url' && value.trim()
          ? toDiscordInviteUrl(value) ?? value
          : value
      const result = await updateAppSetting(key, normalizedValue)
      if (result.error) {
        setError(result.error)
        setSavingKey(null)
        return
      }
      if (label === 'description') setSavedDescription(value)
      else if (label === 'discord') {
        setDiscordInviteUrl(normalizedValue)
        setSavedDiscordInviteUrl(normalizedValue)
      }
      else if (label === 'youtube') setSavedYoutubeUrl(value)
      setSavingKey(null)
      setSavedKey(label)
      router.refresh()
    })
  }

  const handleAccentSelect = (next: AccentColor) => {
    if (next === accentColor) return
    setAccentColor(next)
    save('accent', 'guild_profile_accent_color', next)
  }

  const handleRecruitmentSelect = (next: RecruitmentStatus) => {
    if (next === recruitmentStatus) return
    setRecruitmentStatus(next)
    save('recruitment', 'guild_profile_recruitment_status', next)
  }

  return (
    <div className="space-y-4">
      {/* 소개글 */}
      <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-bold text-white text-base">{t('descriptionTitle')}</h2>
          <p className="text-gray-500 text-xs mt-1">{t('descriptionDescription')}</p>
        </div>
        <div>
          <label htmlFor={descId} className="sr-only">
            {t('descriptionTitle')}
          </label>
          <textarea
            id={descId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder={t('descriptionPlaceholder')}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 resize-y"
          />
          <div className="flex items-center justify-between mt-1">
            <span className={`text-[11px] ${descTooLong ? 'text-red-400' : 'text-gray-500'}`}>
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </span>
            {savedKey === 'description' && !descDirty && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Check size={10} />
                {tCommon('saved')}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => save('description', 'guild_profile_description', description)}
          disabled={savingKey !== null || !descDirty || descTooLong}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {savingKey === 'description' ? tCommon('saving') : tCommon('save')}
        </button>
      </section>

      {/* 색상 팔레트 */}
      <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-bold text-white text-base">{t('accentColorTitle')}</h2>
          <p className="text-gray-500 text-xs mt-1">{t('accentColorDescription')}</p>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {ACCENT_COLORS.map((color) => {
            const cls = ACCENT_CLASS_MAP[color]
            const isActive = accentColor === color
            return (
              <button
                key={color}
                type="button"
                onClick={() => handleAccentSelect(color)}
                disabled={savingKey !== null}
                aria-pressed={isActive}
                className={`relative aspect-square rounded-lg border-2 transition-[border-color,opacity,scale] duration-150 ease-out ${
                  isActive ? `${cls.border} scale-105` : 'border-transparent hover:border-gray-600'
                } disabled:opacity-50`}
                title={t(`accentColor_${color}`)}
              >
                <div className={`absolute inset-1 rounded-md ${cls.heroGradient}`} />
                <div className={`absolute inset-0 rounded-md ${cls.heroGlow} blur-xl opacity-50`} />
                {isActive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Check size={18} className="text-white drop-shadow" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
        {savedKey === 'accent' && (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <Check size={10} />
            {tCommon('saved')}
          </p>
        )}
      </section>

      {/* 모집 상태 + Discord */}
      <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-bold text-white text-base">{t('recruitmentTitle')}</h2>
          <p className="text-gray-500 text-xs mt-1">{t('recruitmentDescription')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {RECRUITMENT_STATUSES.map((status) => {
            const isActive = recruitmentStatus === status
            return (
              <button
                key={status}
                type="button"
                onClick={() => handleRecruitmentSelect(status)}
                disabled={savingKey !== null}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                  isActive
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
                } disabled:opacity-50`}
              >
                {t(`recruitment_${status}`)}
              </button>
            )
          })}
        </div>

        <div>
          <label htmlFor={urlId} className="text-gray-400 text-xs mb-1 block">
            {t('discordInviteLabel')}
          </label>
          <input
            id={urlId}
            type="url"
            inputMode="url"
            value={discordInviteUrl}
            onChange={(e) => setDiscordInviteUrl(e.target.value)}
            placeholder="https://discord.gg/..."
            className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 ${
              discordInviteInvalid ? 'border-red-700' : 'border-gray-700'
            }`}
          />
          <div className="flex items-center justify-between mt-1">
            <span
              className={`text-[11px] ${
                urlTooLong || discordInviteInvalid ? 'text-red-400' : 'text-gray-500'
              }`}
            >
              {discordInviteUrl.length}/{URL_MAX_LENGTH}
            </span>
            {savedKey === 'discord' && !urlDirty && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Check size={10} />
                {tCommon('saved')}
              </span>
            )}
          </div>
          {discordInviteInvalid && (
            <p className="mt-1 text-[11px] text-red-400">{t('discordInviteInvalid')}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => save('discord', 'guild_profile_discord_invite_url', discordInviteUrl)}
          disabled={savingKey !== null || !urlDirty || urlTooLong || discordInviteInvalid}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {savingKey === 'discord' ? tCommon('saving') : tCommon('save')}
        </button>

        {savedKey === 'recruitment' && (
          <p className="text-[11px] text-emerald-400 flex items-center gap-1">
            <Check size={10} />
            {tCommon('saved')}
          </p>
        )}
      </section>

      {/* YouTube 영상 — 공개 프로필에 임베드. sanitizer 통과 못한 URL 은 서버에서
          거부, 클라이언트는 입력 즉시 회색 처리 + 저장 버튼 비활성. */}
      <section className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-3">
        <div>
          <h2 className="font-bold text-white text-base">{t('youtubeUrlTitle')}</h2>
          <p className="text-gray-500 text-xs mt-1">{t('youtubeUrlDescription')}</p>
        </div>
        <div>
          <label htmlFor={youtubeId} className="sr-only">
            {t('youtubeUrlTitle')}
          </label>
          <input
            id={youtubeId}
            type="url"
            inputMode="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder={t('youtubeUrlPlaceholder')}
            className={`w-full bg-gray-800 border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500 ${
              youtubeInvalid ? 'border-red-700' : 'border-gray-700'
            }`}
          />
          <div className="flex items-center justify-between mt-1">
            <span
              className={`text-[11px] ${
                youtubeTooLong || youtubeInvalid ? 'text-red-400' : 'text-gray-500'
              }`}
            >
              {youtubeUrl.length}/{URL_MAX_LENGTH}
            </span>
            {savedKey === 'youtube' && !youtubeDirty && (
              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                <Check size={10} />
                {tCommon('saved')}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => save('youtube', 'guild_profile_youtube_url', youtubeUrl)}
          disabled={
            savingKey !== null || !youtubeDirty || youtubeTooLong || youtubeInvalid
          }
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {savingKey === 'youtube' ? tCommon('saving') : tCommon('save')}
        </button>
      </section>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}
    </div>
  )
}
