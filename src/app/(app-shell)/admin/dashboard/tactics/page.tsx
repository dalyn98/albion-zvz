import Link from 'next/link'
import { BookOpen, Clock, FileText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { listTacticBoards } from '@/lib/tactics/queries'
import TacticCreateForm from '@/components/tactics/TacticCreateForm'

export const dynamic = 'force-dynamic'

export default async function TacticsAdminPage() {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const [t, boards] = await Promise.all([
    getTranslations('tactics'),
    listTacticBoards(guildId),
  ])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          {t('adminEyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
          {t('adminTitle')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
          {t('adminDescription')}
        </p>
      </div>

      <TacticCreateForm />

      {boards.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-10 text-center">
          <BookOpen size={30} className="mx-auto text-gray-600" />
          <p className="mt-3 text-sm text-gray-400">{t('emptyBoards')}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/admin/dashboard/tactics/${board.id}`}
              className="rounded-xl border border-gray-800 bg-gray-950 p-4 transition-colors hover:border-amber-500/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-white">{board.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                    {board.summary || t('noSummary')}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-gray-700 px-2 py-0.5 text-[11px] font-semibold text-gray-300">
                  {t(`status.${board.status}`)}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <FileText size={13} />
                  {t('stepCount', { count: board.stepCount })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock size={13} />
                  {new Date(board.updatedAt).toLocaleDateString()}
                </span>
                <span>{t(`terrain.${board.terrainType}`)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
