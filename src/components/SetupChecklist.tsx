import Link from 'next/link'
import { ListChecks, Check, Settings, AlertCircle } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAppSetting } from '@/lib/app-settings'
import { getTenantDiscordConfig } from '@/lib/tenant'

interface Props {
  guildId: string
}

interface ChecklistItem {
  key: 'eventChannel' | 'albionHomeGuildId'
  done: boolean
  label: string
  description: string
  hint: string
}

export default async function SetupChecklist({ guildId }: Props) {
  const [t, tenantConfig, albionHomeGuildId] = await Promise.all([
    getTranslations('setupChecklist'),
    getTenantDiscordConfig(guildId),
    getAppSetting('albion_home_guild_id', '', guildId),
  ])

  const items: ChecklistItem[] = [
    {
      key: 'eventChannel',
      done: !!tenantConfig?.eventChannelId,
      label: t('eventChannelLabel'),
      description: t('eventChannelDescription'),
      hint: t('eventChannelHint'),
    },
    {
      key: 'albionHomeGuildId',
      done: !!albionHomeGuildId.trim(),
      label: t('albionHomeGuildIdLabel'),
      description: t('albionHomeGuildIdDescription'),
      hint: t('albionHomeGuildIdHint'),
    },
  ]

  const pendingCount = items.filter((it) => !it.done).length
  if (pendingCount === 0) return null

  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-500/5 p-4 sm:p-5 space-y-3">
      <div className="flex items-start gap-3">
        <ListChecks size={18} className="text-amber-300 mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-amber-100">
            {t('title', { count: pendingCount })}
          </h2>
          <p className="text-xs text-amber-100/70 mt-1 leading-relaxed">{t('description')}</p>
        </div>
      </div>

      <ul className="space-y-2 pl-1">
        {items.map((it) => (
          <li
            key={it.key}
            className="flex items-start gap-2.5 text-xs"
          >
            <span
              className={`mt-0.5 flex h-4 w-4 items-center justify-center rounded-full flex-shrink-0 ${
                it.done
                  ? 'bg-emerald-500/30 text-emerald-200'
                  : 'bg-gray-800 text-amber-300 border border-amber-400/40'
              }`}
              aria-hidden
            >
              {it.done ? <Check size={10} /> : <AlertCircle size={10} />}
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`font-semibold ${
                  it.done ? 'text-emerald-200/80 line-through' : 'text-amber-100'
                }`}
              >
                {it.label}
              </p>
              {!it.done && (
                <>
                  <p className="text-amber-100/70 mt-0.5 leading-relaxed">{it.description}</p>
                  <p className="text-amber-200/50 mt-0.5 italic">{it.hint}</p>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/admin/dashboard/settings"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-100 hover:text-white underline-offset-4 hover:underline"
      >
        <Settings size={12} />
        {t('configureLink')}
      </Link>
    </div>
  )
}
