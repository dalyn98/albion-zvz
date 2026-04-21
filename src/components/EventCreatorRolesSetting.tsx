'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save } from 'lucide-react'
import { updateAppSetting } from '@/app/actions/settings'
import { listGuildRoles, type DiscordRoleOption } from '@/app/actions/notifications'

interface Props {
  initialRoleIds: string[]
}

export default function EventCreatorRolesSetting({ initialRoleIds }: Props) {
  const t = useTranslations('adminEventCreatorRoles')
  const router = useRouter()
  const [roles, setRoles] = useState<DiscordRoleOption[] | null>(null)
  const [rolesError, setRolesError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialRoleIds))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    void (async () => {
      const res = await listGuildRoles()
      if (res.error) setRolesError(true)
      else setRoles(res.roles)
    })()
  }, [])

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    setSaved(false)
  }

  const sortedInitial = [...initialRoleIds].sort().join(',')
  const sortedCurrent = [...selected].sort().join(',')
  const dirty = sortedInitial !== sortedCurrent

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSaved(false)
    const ids = [...selected]
    const payload = JSON.stringify(ids)
    const result = await updateAppSetting('event_creator_role_ids', payload)
    if (result.error) setError(result.error)
    else {
      setSaved(true)
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 space-y-4">
      <div>
        <h2 className="font-bold text-white">{t('title')}</h2>
        <p className="text-gray-500 text-xs mt-1">{t('description')}</p>
        <p className="text-amber-400/80 text-xs mt-1">{t('reloginHint')}</p>
      </div>

      {rolesError && (
        <p className="text-xs text-red-400">{t('rolesError')}</p>
      )}
      {!rolesError && roles === null && (
        <p className="text-xs text-gray-500">{t('rolesLoading')}</p>
      )}
      {roles && roles.length === 0 && (
        <p className="text-xs text-gray-500">{t('rolesEmpty')}</p>
      )}
      {roles && roles.length > 0 && (
        <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5 rounded-lg border border-gray-800 bg-gray-950 p-2">
          {roles.map((role) => {
            const checked = selected.has(role.id)
            return (
              <label
                key={role.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                  checked ? 'bg-amber-500/10' : 'hover:bg-gray-800'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(role.id)}
                  className="accent-amber-500"
                />
                <span className="text-sm text-white">{role.name}</span>
                <span className="text-[11px] text-gray-500 ml-auto">{role.id}</span>
              </label>
            )
          })}
        </div>
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
          disabled={loading || !dirty || roles === null}
          className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-2 rounded-lg transition-colors text-sm"
        >
          <Save size={14} />
          {loading ? t('saving') : t('save')}
        </button>
        {saved && !dirty && <span className="text-[11px] text-emerald-400">{t('saved')}</span>}
      </div>
    </div>
  )
}
