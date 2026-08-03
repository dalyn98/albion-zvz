'use client'

import { getServerActionClientErrorMessage } from '@/lib/server-action-client-error'
// 리기어 운영 모드 토글을 한 카드로 묶음.
//   - 자동 리기어 (auto_regear_enabled): cron 이 victim → AODP → pending 자동 생성
//   - 제작 리기어 (craft_regear_enabled): 박스 픽업 모드 활성화
//   - 인증 게이트 (regear_require_verification): 미인증 길드원 신청 차단
//   - 연합 리기어 (alliance_regear_enabled): 연합원 수동 신청만 허용
//   - 오버차지 리기어 (regear_overcharge_enabled): 오버차지로 장비 파괴 시 신청 받기
// 각 토글은 독립 app_setting 이라 Save 버튼은 변경된 키만 일괄 update.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Settings2 } from 'lucide-react'
import {
  updateAppSetting,
  updateRegearSupportConfiguration,
} from '@/app/actions/settings'
import type { RegearFulfillmentMode } from '@/lib/regear-support'

interface Props {
  initialSupportEnabled: boolean
  initialAutoEnabled: boolean
  initialCraftEnabled: boolean
  initialRequireVerification: boolean
  initialAllianceRegearEnabled: boolean
  initialOverchargeEnabled: boolean
  initialOverchargeVideoRequired: boolean
  initialSkipLowConfidence: boolean
  embedded?: boolean
}

export default function RegearModeCard({
  initialSupportEnabled,
  initialAutoEnabled,
  initialCraftEnabled,
  initialRequireVerification,
  initialAllianceRegearEnabled,
  initialOverchargeEnabled,
  initialOverchargeVideoRequired,
  initialSkipLowConfidence,
  embedded = false,
}: Props) {
  const router = useRouter()
  const tc = useTranslations('common')
  const tActionErrors = useTranslations('errors')
  const t = useTranslations('adminRegearMode')
  const [supportEnabled, setSupportEnabled] = useState(initialSupportEnabled)
  const [autoEnabled, setAutoEnabled] = useState(initialAutoEnabled)
  const [craftEnabled, setCraftEnabled] = useState(initialCraftEnabled)
  const [requireVerification, setRequireVerification] = useState(initialRequireVerification)
  const [allianceRegearEnabled, setAllianceRegearEnabled] = useState(
    initialAllianceRegearEnabled,
  )
  const [overchargeEnabled, setOverchargeEnabled] = useState(initialOverchargeEnabled)
  const [overchargeVideoRequired, setOverchargeVideoRequired] = useState(
    initialOverchargeVideoRequired,
  )
  const [skipLowConfidence, setSkipLowConfidence] = useState(initialSkipLowConfidence)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const fulfillmentMode: RegearFulfillmentMode = craftEnabled ? 'crafted' : 'silver'
  const configurationDirty =
    supportEnabled !== initialSupportEnabled ||
    (supportEnabled && craftEnabled !== initialCraftEnabled)
  const operationalDirty =
    supportEnabled && (
      autoEnabled !== initialAutoEnabled ||
      requireVerification !== initialRequireVerification ||
      allianceRegearEnabled !== initialAllianceRegearEnabled ||
      overchargeEnabled !== initialOverchargeEnabled ||
      overchargeVideoRequired !== initialOverchargeVideoRequired ||
      skipLowConfidence !== initialSkipLowConfidence
    )
  const dirty = configurationDirty || operationalDirty

  const handleSave = async () => {
    try {
      setLoading(true)
      setError('')
      setSaved(false)
      if (configurationDirty) {
        const result = await updateRegearSupportConfiguration({
          supported: supportEnabled,
          fulfillmentMode: supportEnabled ? fulfillmentMode : null,
        })
        if (result.error) {
          setError(result.error)
          return
        }
      }
      if (supportEnabled && autoEnabled !== initialAutoEnabled) {
        const r = await updateAppSetting('auto_regear_enabled', autoEnabled ? 'true' : 'false')
        if (r.error) {
          setError(r.error)
          return
        }
      }
      if (supportEnabled && requireVerification !== initialRequireVerification) {
        const r = await updateAppSetting(
          'regear_require_verification',
          requireVerification ? 'true' : 'false',
        )
        if (r.error) {
          setError(r.error)
          return
        }
      }
      if (supportEnabled && allianceRegearEnabled !== initialAllianceRegearEnabled) {
        const r = await updateAppSetting(
          'alliance_regear_enabled',
          allianceRegearEnabled ? 'true' : 'false',
        )
        if (r.error) {
          setError(r.error)
          return
        }
      }
      if (supportEnabled && overchargeEnabled !== initialOverchargeEnabled) {
        const r = await updateAppSetting(
          'regear_overcharge_enabled',
          overchargeEnabled ? 'true' : 'false',
        )
        if (r.error) {
          setError(r.error)
          return
        }
      }
      if (
        supportEnabled &&
        overchargeVideoRequired !== initialOverchargeVideoRequired
      ) {
        const r = await updateAppSetting(
          'regear_overcharge_video_required',
          overchargeVideoRequired ? 'true' : 'false',
        )
        if (r.error) {
          setError(r.error)
          return
        }
      }
      if (supportEnabled && skipLowConfidence !== initialSkipLowConfidence) {
        const r = await updateAppSetting(
          'auto_regear_skip_low_confidence',
          skipLowConfidence ? 'true' : 'false',
        )
        if (r.error) {
          setError(r.error)
          return
        }
      }
      setSaved(true)
      router.refresh()
    } catch (actionError) {
      setError(getServerActionClientErrorMessage(actionError, {
        expired: tActionErrors('actionExpired'),
        fallback: tActionErrors('actionFailed'),
      }))
    } finally {
      setLoading(false)
    }
  }

  const containerClass = embedded
    ? 'space-y-3'
    : 'bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4'

  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        {!embedded && <Settings2 size={16} className="text-amber-400 mt-0.5" />}
        <div>
          {embedded ? (
            <h3 className="font-semibold text-white text-sm">{t('title')}</h3>
          ) : (
            <h2 className="font-bold text-white">{t('title')}</h2>
          )}
          <p className="text-gray-500 text-xs mt-1">{t('description')}</p>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-white">{t('supportLabel')}</legend>
        <p className="text-[11px] text-gray-500">{t('supportHint')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ChoiceCard
            checked={!supportEnabled}
            onChange={() => {
              setSupportEnabled(false)
              setSaved(false)
            }}
            label={t('unsupportedLabel')}
            hint={t('unsupportedHint')}
          />
          <ChoiceCard
            checked={supportEnabled}
            onChange={() => {
              setSupportEnabled(true)
              setSaved(false)
            }}
            label={t('supportedLabel')}
            hint={t('supportedHint')}
          />
        </div>
      </fieldset>

      {supportEnabled && (
        <>
          <fieldset className="space-y-2 border-t border-gray-800 pt-3">
            <legend className="text-sm font-semibold text-white">
              {t('fulfillmentLabel')}
            </legend>
            <p className="text-[11px] text-gray-500">{t('fulfillmentHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceCard
                checked={!craftEnabled}
                onChange={() => {
                  setCraftEnabled(false)
                  setSaved(false)
                }}
                label={t('silverLabel')}
                hint={t('silverHint')}
              />
              <ChoiceCard
                checked={craftEnabled}
                onChange={() => {
                  setCraftEnabled(true)
                  setSaved(false)
                }}
                label={t('craftedLabel')}
                hint={t('craftedHint')}
              />
            </div>
          </fieldset>

          <div className="space-y-2.5 border-t border-gray-800 pt-3">
            <ToggleRow
              checked={autoEnabled}
              onChange={(v) => {
                setAutoEnabled(v)
                setSaved(false)
              }}
              label={t('autoLabel')}
              hint={t('autoHint')}
            />
            <ToggleRow
              checked={requireVerification}
              onChange={(v) => {
                setRequireVerification(v)
                setSaved(false)
              }}
              label={t('verifyLabel')}
              hint={t('verifyHint')}
            />
            <ToggleRow
              checked={allianceRegearEnabled}
              onChange={(v) => {
                setAllianceRegearEnabled(v)
                setSaved(false)
              }}
              label={t('allianceLabel')}
              hint={t('allianceHint')}
            />
            <ToggleRow
              checked={overchargeEnabled}
              onChange={(v) => {
                setOverchargeEnabled(v)
                setSaved(false)
              }}
              label={t('overchargeLabel')}
              hint={t('overchargeHint')}
            />
            {overchargeEnabled && (
              <div className="ml-6 border-l border-orange-500/30 pl-3">
                <ToggleRow
                  checked={overchargeVideoRequired}
                  onChange={(v) => {
                    setOverchargeVideoRequired(v)
                    setSaved(false)
                  }}
                  label={t('overchargeVideoRequiredLabel')}
                  hint={t('overchargeVideoRequiredHint')}
                />
              </div>
            )}
            <ToggleRow
              checked={skipLowConfidence}
              onChange={(v) => {
                setSkipLowConfidence(v)
                setSaved(false)
              }}
              label={t('skipLowConfidenceLabel')}
              hint={t('skipLowConfidenceHint')}
            />
          </div>
        </>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg px-3 py-2 text-red-300 text-xs">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || !dirty}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? tc('saving') : tc('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{tc('saved')}</span>}
      </div>
    </div>
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
          ? 'border-amber-400/60 bg-amber-500/10'
          : 'border-gray-800 bg-gray-950/30 hover:border-gray-700'
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-amber-500"
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
    <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg p-2 -mx-2 hover:bg-gray-800/40 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-amber-500"
      />
      <span className="flex-1">
        <span className="text-sm text-white font-semibold">{label}</span>
        <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>
      </span>
    </label>
  )
}
