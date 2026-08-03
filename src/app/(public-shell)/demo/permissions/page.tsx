'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Check, KeyRound, Save, Sparkles, UserCog } from 'lucide-react'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import { useDemoToast } from '../_components/DemoFeedbackProvider'
import {
  CAPABILITY_GROUPS,
  CAPABILITY_PRESETS,
  type CapabilityKey,
  type CapabilityPreset,
} from '@/lib/permissions'

const PERMISSIONS_TOUR_STEPS = [
  { id: 'permissions-role-settings' },
  { id: 'permissions-presets' },
  { id: 'permissions-role-grants' },
  { id: 'permissions-user-overrides' },
] as const

const INITIAL_ROLE_CAPABILITIES: readonly CapabilityKey[] = [
  'REGEAR_APPROVE',
  'REGEAR_EDIT_PRICE',
  'EVENT_CREATE_COMBAT',
  'EVENT_MANAGE',
  'STATS_VIEW',
]

export default function DemoPermissionsPage() {
  const t = useTranslations('permissions')
  const tDemo = useTranslations('demo.permissions')
  const { showToast } = useDemoToast()
  const [selectedRole, setSelectedRole] = useState(tDemo('sampleRoleRegear'))
  const [capabilities, setCapabilities] = useState<ReadonlySet<CapabilityKey>>(
    () => new Set(INITIAL_ROLE_CAPABILITIES),
  )
  const [overrideMode, setOverrideMode] = useState<'grant' | 'revoke'>('grant')

  const enabledCount = capabilities.size
  const groupedCapabilities = useMemo(() => Object.entries(CAPABILITY_GROUPS), [])

  const toggleCapability = (key: CapabilityKey) => {
    setCapabilities((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const applyPreset = (preset: CapabilityPreset) => {
    setSelectedRole(t(`presets.${preset.key}`))
    setCapabilities(new Set(preset.capabilities))
    showToast(tDemo('toastPreset'))
  }

  const handleSave = () => {
    showToast(tDemo('toastSaved', { count: enabledCount }))
  }

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={PERMISSIONS_TOUR_STEPS} namespace="permissions" />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <KeyRound size={22} className="text-amber-300" />
          {t('heading')}
        </h1>
        <p className="text-sm text-gray-400 max-w-2xl">{t('description')}</p>
      </header>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemo('notice')}</p>
      </div>

      <section
        data-tour-id="permissions-role-settings"
        className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold text-white">{t('roleSettings.title')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('roleSettings.description')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RoleSetting label={tDemo('adminRoles')} value="Guild Master, Council" />
          <RoleSetting label={tDemo('eventCreatorRoles')} value="Caller, Officer" />
          <RoleSetting label={tDemo('activeMemberRoles')} value="Member, Trial" />
        </div>
      </section>

      <section
        data-tour-id="permissions-presets"
        className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold text-white">{t('presets.title')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('presets.description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {CAPABILITY_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs font-semibold text-gray-200 transition-colors hover:border-amber-500/50 hover:text-amber-200"
            >
              {t(`presets.${preset.key}`)}
            </button>
          ))}
        </div>
      </section>

      <section
        data-tour-id="permissions-role-grants"
        className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('roleGrantEditor.heading')}</h2>
            <p className="mt-1 text-sm text-gray-400">{t('roleGrantEditor.description')}</p>
          </div>
          <div className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-xs text-gray-300">
            {selectedRole} · {tDemo('enabledCount', { count: enabledCount })}
          </div>
        </div>

        <div className="space-y-4">
          {groupedCapabilities.map(([group, keys]) => (
            <div key={group} className="rounded-lg border border-gray-800 bg-gray-950/60 p-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                {t(`capabilityGroup.${group}`)}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {keys.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleCapability(key)}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      capabilities.has(key)
                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                        : 'border-gray-800 bg-gray-900 text-gray-400 hover:border-gray-600'
                    }`}
                  >
                    <span>{t(`capability.${key}`)}</span>
                    {capabilities.has(key) && <Check size={13} className="text-amber-300" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-black transition-colors hover:bg-amber-400"
        >
          <Save size={15} />
          {t('actions.save')}
        </button>
      </section>

      <section
        data-tour-id="permissions-user-overrides"
        className="rounded-xl border border-gray-800 bg-gray-900 p-4 sm:p-5 space-y-4"
      >
        <div>
          <h2 className="text-lg font-semibold text-white">{t('userOverrideEditor.heading')}</h2>
          <p className="mt-1 text-sm text-gray-400">{t('userOverrideEditor.description')}</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3">
          <div className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wider text-gray-500">
              {t('userOverrideEditor.discordMemberLabel')}
            </p>
            <p className="mt-1 text-sm font-semibold text-white">@Daewi</p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-700 bg-gray-950 p-1">
            {(['grant', 'revoke'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setOverrideMode(mode)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${
                  overrideMode === mode ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode === 'grant' ? t('userOverrideEditor.grantedHeading') : t('userOverrideEditor.revokedHeading')}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100 flex items-start gap-2">
          <UserCog size={14} className="mt-0.5 shrink-0" />
          <span>{tDemo('overrideExample')}</span>
        </div>
      </section>
    </div>
  )
}

function RoleSetting({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-950/70 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
    </div>
  )
}
