import { getTranslations } from 'next-intl/server'
import { ExternalLink, Info, Palette, Sparkles, Users } from 'lucide-react'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import { EmptyState, SectionCard } from '@/components/ui-patterns'

// 실 /admin/dashboard/guild-profile 의 비주얼 클론 — 길드 소개 textarea,
// 테마 색상 픽커, 모집 상태 선택, Discord 초대 링크 입력. GuildProfileEditor /
// GuildProfileEnableToggle 은 'use client' 라 SSR 마크업으로 옮겼다.
// 모든 인풋·버튼은 DemoActionButton — 토스트로 데모 안내.

type AccentColor = 'amber' | 'rose' | 'emerald' | 'sky' | 'violet' | 'orange' | 'pink' | 'slate'
type RecruitmentStatus = 'open' | 'selective' | 'closed'

const ACCENT_COLORS: ReadonlyArray<AccentColor> = [
  'amber',
  'rose',
  'emerald',
  'sky',
  'violet',
  'orange',
  'pink',
  'slate',
]

const ACCENT_SWATCH: Record<AccentColor, string> = {
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  sky: 'bg-sky-500',
  violet: 'bg-violet-500',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  slate: 'bg-slate-500',
}

const ACTIVE_ACCENT: AccentColor = 'amber'
const ACTIVE_RECRUITMENT: RecruitmentStatus = 'open'

const RECRUITMENT_OPTIONS: ReadonlyArray<RecruitmentStatus> = ['open', 'selective', 'closed']

const RECRUITMENT_STYLE: Record<RecruitmentStatus, { bg: string; text: string; border: string }> = {
  open: { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/40' },
  selective: { bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/40' },
  closed: { bg: 'bg-gray-700/40', text: 'text-gray-400', border: 'border-gray-600' },
}

const DEMO_DISCORD_INVITE = 'https://discord.gg/demo-guild'

const DEMO_PREVIEW_HREF = '/g/demo-guild'
const GUILD_PROFILE_TOUR_STEPS = [
  { id: 'guild-profile-description' },
  { id: 'guild-profile-theme' },
  { id: 'guild-profile-recruitment' },
  { id: 'guild-profile-preview' },
] as const

export default async function DemoGuildProfilePage() {
  const [t, tDemoMe, tDemoGuildProfile, tCta] = await Promise.all([
    getTranslations('adminGuildProfile'),
    getTranslations('demo.me'),
    getTranslations('demo.guildProfile'),
    getTranslations('demo.ctaCard'),
  ])

  return (
    <div className="space-y-5">
      <DemoGuidedTour steps={GUILD_PROFILE_TOUR_STEPS} namespace="guildProfile" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('pageTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('pageDescription')}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
            <Sparkles size={11} />
            {tDemoMe('viewingAsEyebrow')}
          </span>
          <DemoActionButton className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-colors">
            <ExternalLink size={12} />
            {t('previewLink')}
          </DemoActionButton>
        </div>
      </div>

      <EmptyState
        icon={Info}
        title={t('inlineEditNoticeTitle')}
        description={t('inlineEditNoticeBody')}
        tone="accent"
        action={
          <DemoActionButton className="inline-flex items-center gap-1 text-amber-300 hover:text-amber-200 text-xs font-semibold">
            {t('inlineEditNoticeLink')}
            <ExternalLink size={11} />
          </DemoActionButton>
        }
      />

      {/* 길드 소개 */}
      <SectionCard data-tour-id="guild-profile-description" className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-white">{t('descriptionTitle')}</h2>
          <p className="text-xs text-gray-500 mt-1">{t('descriptionDescription')}</p>
        </div>
        <DemoActionButton
          asDiv
          className="w-full min-h-[100px] bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 cursor-text hover:border-gray-600 whitespace-pre-wrap"
        >
          {tDemoGuildProfile('descriptionSample')}
        </DemoActionButton>
      </SectionCard>

      {/* 테마 색상 */}
      <SectionCard data-tour-id="guild-profile-theme" className="space-y-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Palette size={16} className="text-amber-400" />
            {t('accentColorTitle')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{t('accentColorDescription')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {ACCENT_COLORS.map((color) => {
            const active = color === ACTIVE_ACCENT
            return (
              <DemoActionButton
                key={color}
                ariaLabel={t(`accentColor_${color}` as Parameters<typeof t>[0])}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                  active
                    ? 'border-amber-500/60 bg-amber-500/10 text-white'
                    : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className={`w-4 h-4 rounded-full ${ACCENT_SWATCH[color]}`} />
                <span>{t(`accentColor_${color}` as Parameters<typeof t>[0])}</span>
              </DemoActionButton>
            )
          })}
        </div>
      </SectionCard>

      {/* 모집 상태 / Discord */}
      <SectionCard data-tour-id="guild-profile-recruitment" className="space-y-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Users size={16} className="text-emerald-400" />
            {t('recruitmentTitle')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{t('recruitmentDescription')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {RECRUITMENT_OPTIONS.map((status) => {
            const active = status === ACTIVE_RECRUITMENT
            const style = RECRUITMENT_STYLE[status]
            return (
              <DemoActionButton
                key={status}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  active
                    ? `${style.bg} ${style.text} ${style.border}`
                    : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                }`}
              >
                {t(`recruitment_${status}` as Parameters<typeof t>[0])}
              </DemoActionButton>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400 font-semibold">{t('discordInviteLabel')}</label>
          <DemoActionButton
            asDiv
            className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 font-mono cursor-text hover:border-gray-600"
        >
          {DEMO_DISCORD_INVITE}
        </DemoActionButton>
      </div>
      </SectionCard>

      {/* 공개 페이지 미리보기 카드 */}
      <SectionCard
        data-tour-id="guild-profile-preview"
        tone="accent"
        className="space-y-3 border-accent/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent"
      >
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <ExternalLink size={16} className="text-amber-400" />
          {tDemoGuildProfile('previewCardTitle')}
        </h2>
        <p className="text-xs text-gray-300 leading-relaxed">
          {tDemoGuildProfile('previewCardDescription')}
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-xs text-amber-300 font-mono truncate">
            albion-guildmanager.com{DEMO_PREVIEW_HREF}
          </code>
          <DemoActionButton className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg text-xs transition-colors">
            <ExternalLink size={12} />
            {t('previewLink')}
          </DemoActionButton>
        </div>
      </SectionCard>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoGuildProfile('ctaTitle')}
        description={tDemoGuildProfile('ctaDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
