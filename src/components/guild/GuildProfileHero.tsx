import { getTranslations } from 'next-intl/server'
import Image from 'next/image'
import {
  Clock,
  ExternalLink,
  Globe,
  Languages,
  ShieldCheck,
} from 'lucide-react'
import { type GuildProfileSettings, type ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import type { AllianceInfo } from '@/lib/guild-profile-stats'
import {
  BannerEditControl,
  EditableField,
  type EditorOption,
} from '@/components/guild/GuildProfileEditControls'
import { HeroChip } from '@/components/guild/GuildProfileSections'

type AccentClasses = (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]

interface Props {
  tenantSlug: string
  displayName: string
  settings: GuildProfileSettings
  accent: AccentClasses
  alliance: AllianceInfo | null
  serverLabel: string | null
  isOwnGuildAdmin: boolean
}

// HERO — 좌측 수직 액센트 바 + 배너 + 글로우 + 미세 노이즈 텍스처.
// 모집 open 일 때 도트가 ping. 길드명은 모바일/데스크탑 4xl→6xl→7xl 로
// 반응형 점진 확대.
export default async function GuildProfileHero({
  tenantSlug,
  displayName,
  settings,
  accent,
  alliance,
  serverLabel,
  isOwnGuildAdmin,
}: Props) {
  const t = await getTranslations('publicGuildProfile')
  const languageLabels = settings.languages.map((code) => t(`language_${code}`))

  // 인라인 편집 select/csv 용 옵션 — 어드민이 아니면 사용되지 않지만 빌드타임에
  // 풀어두어야 client 컴포넌트가 t() 함수를 안 받는다 (RSC → client prop 룰).
  const recruitmentOptions: EditorOption[] = [
    { value: 'open', label: t('recruitment_open') },
    { value: 'selective', label: t('recruitment_selective') },
    { value: 'closed', label: t('recruitment_closed') },
  ]
  const serverOptions: EditorOption[] = [
    { value: '', label: t('serverDefaultOption') },
    { value: 'east', label: t('server_east') },
    { value: 'west', label: t('server_west') },
    { value: 'europe', label: t('server_europe') },
  ]
  const languageOptions: EditorOption[] = (
    ['ko', 'ja', 'en', 'zh', 'es', 'fr', 'de', 'pt'] as const
  ).map((code) => ({ value: code, label: t(`language_${code}`) }))

  return (
    <header className="relative overflow-hidden">
      <BannerEditControl
        enabled={isOwnGuildAdmin}
        currentUrl={settings.bannerUrl}
        currentOpacity={settings.bannerOpacity}
      />
      <div className={`absolute inset-0 ${accent.heroGradient}`} />
      <div
        className={`absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full ${accent.heroGlow} blur-3xl pointer-events-none`}
      />
      {settings.bannerUrl && (
        <div className="absolute inset-0 overflow-hidden">
          <Image
            src={settings.bannerUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
            style={{ opacity: settings.bannerOpacity / 100 }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/60 to-[#08090d]" />
        </div>
      )}
      {/* 미세한 도트 노이즈 — 단조로운 그라디언트에 결을 입힌다. 4% 투명도라
          텍스처는 거의 인지되지 않지만 hero 가 "재질감" 을 갖는다. */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />
      <div className={`absolute top-0 left-0 bottom-0 w-[3px] ${accent.bar}`} />
      <div className={`absolute bottom-0 left-0 right-0 h-px ${accent.divider}`} />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 lg:py-32">
        <div className="space-y-6">
          {/* 연합 태그 — 게임 내 alliance 표시. recruitment pill 보다 한 단계 큰
              pill (text-sm + ring-2) + 명시 라벨로 시각 비중 강조. 미가입 길드는
              자연스레 숨김. AllianceName 은 hover tooltip 으로만 노출. */}
          {alliance && (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-lg text-sm font-bold ring-2 backdrop-blur-sm ${accent.badgeBg} ${accent.badgeText} ${accent.badgeRing}`}
                title={alliance.name ?? undefined}
              >
                <ShieldCheck size={14} />
                <span className="text-[10px] uppercase tracking-[0.25em] opacity-80">
                  {t('allianceLabel')}
                </span>
                <span className="font-mono tracking-wider text-base">
                  [{alliance.tag}]
                </span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <EditableField
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_recruitment_status"
              currentValue={settings.recruitmentStatus}
              kind="select"
              options={recruitmentOptions}
              label={t('recruitmentEditLabel')}
              display="inline"
            >
              <span
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ring-1 backdrop-blur-sm ${accent.badgeBg} ${accent.badgeText} ${accent.badgeRing}`}
              >
                <span className="relative flex w-2 h-2">
                  {settings.recruitmentStatus === 'open' && (
                    <span
                      className={`absolute inline-flex w-full h-full rounded-full ${accent.dot} opacity-75 animate-ping`}
                    />
                  )}
                  <span className={`relative inline-flex w-2 h-2 rounded-full ${accent.dot}`} />
                </span>
                {t(`recruitment_${settings.recruitmentStatus}`)}
              </span>
            </EditableField>
            <span className="text-gray-500 text-[11px] font-mono tracking-[0.2em] uppercase">
              /g/{tenantSlug}
            </span>
          </div>
          <h1
            className={`text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter ${accent.heading} drop-shadow-[0_4px_20px_rgba(0,0,0,0.6)] break-words`}
          >
            {displayName}
          </h1>
          <EditableField
            enabled={isOwnGuildAdmin}
            settingKey="guild_profile_description"
            currentValue={settings.description}
            kind="textarea"
            label={t('descriptionEditLabel')}
            emptyLabel={t('descriptionAddLabel')}
            placeholder={t('descriptionPlaceholder')}
            maxLength={500}
          >
            {settings.description.length > 0 && (
              <p className="text-gray-200 text-base sm:text-lg leading-relaxed max-w-2xl whitespace-pre-line">
                {settings.description}
              </p>
            )}
          </EditableField>
          {/* hero 칩 — 서버 (항상 표시), 활동 시간대 (admin 입력 시), 언어 (admin 입력 시).
              glass + ring 으로 hero 톤 유지. Lucide 아이콘으로 시각 라벨 보강.
              어드민이 본인 길드를 볼 때는 각 칩이 인라인 편집 가능. 빈 칩은
              "+ 추가" 버튼으로 대체된다 (server 는 fallback 이 있어 늘 표시). */}
          <div className="flex flex-wrap items-center gap-2">
            <EditableField
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_server"
              currentValue={settings.serverOverride}
              kind="select"
              options={serverOptions}
              label={t('serverEditLabel')}
              emptyLabel={t('serverAddLabel')}
              display="inline"
            >
              {serverLabel && (
                <HeroChip icon={<Globe size={12} />} label={serverLabel} accent={accent} />
              )}
            </EditableField>
            <EditableField
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_active_hours"
              currentValue={settings.activeHours}
              kind="text"
              label={t('activeHoursEditLabel')}
              emptyLabel={t('activeHoursAddLabel')}
              placeholder={t('activeHoursPlaceholder')}
              maxLength={80}
              display="inline"
            >
              {settings.activeHours.length > 0 && (
                <HeroChip
                  icon={<Clock size={12} />}
                  label={settings.activeHours}
                  accent={accent}
                />
              )}
            </EditableField>
            <EditableField
              enabled={isOwnGuildAdmin}
              settingKey="guild_profile_languages"
              currentValue={settings.languages.join(',')}
              kind="csv"
              options={languageOptions}
              label={t('languagesEditLabel')}
              emptyLabel={t('languagesAddLabel')}
              display="inline"
            >
              {languageLabels.length > 0 && (
                <HeroChip
                  icon={<Languages size={12} />}
                  label={languageLabels.join(' / ')}
                  accent={accent}
                />
              )}
            </EditableField>
          </div>
          {/* Discord CTA — 모집 중이고 invite URL 이 채워졌을 때 노출. 어드민
              본인일 때는 url 이 비어 있어도 "+ 추가" 버튼으로 보여 직접 채우게
              한다. recruitment === 'closed' 면 invite 자체가 의미 없어 어드민
              에게도 숨김. */}
          {settings.recruitmentStatus !== 'closed' &&
            (isOwnGuildAdmin || settings.discordInviteUrl.length > 0) && (
              <div className="pt-3">
                <EditableField
                  enabled={isOwnGuildAdmin}
                  settingKey="guild_profile_discord_invite_url"
                  currentValue={settings.discordInviteUrl}
                  kind="text"
                  label={t('discordInviteEditLabel')}
                  emptyLabel={t('discordInviteAddLabel')}
                  placeholder={t('discordInvitePlaceholder')}
                  maxLength={200}
                >
                  {settings.discordInviteUrl.length > 0 && (
                    <a
                      href={settings.discordInviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`group inline-flex items-center gap-2 ${accent.ctaBg} font-bold px-6 py-3.5 rounded-lg transition-all text-sm shadow-lg hover:shadow-2xl hover:-translate-y-0.5`}
                    >
                      {t('joinCta')}
                      <ExternalLink
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                      />
                    </a>
                  )}
                </EditableField>
              </div>
            )}
        </div>
      </div>
    </header>
  )
}
