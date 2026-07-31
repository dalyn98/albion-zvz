import Link from 'next/link'
import { BookOpen, FileText } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sessionCanViewTactics } from '@/lib/tactics/access'
import { listPublishedTacticBoards } from '@/lib/tactics/queries'
import { isTacticsExperimentalEnabled } from '@/lib/tactics/feature-server'

export const dynamic = 'force-dynamic'

export default async function TacticsPage() {
  const [session, t] = await Promise.all([getSession(), getTranslations('tactics')])
  if (!session) redirect('/')
  if (!sessionCanViewTactics(session)) redirect('/')
  const guildId = await getSessionGuildId(session)
  if (!(await isTacticsExperimentalEnabled(guildId))) redirect('/')
  const boards = await listPublishedTacticBoards(guildId)

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:py-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
          {t('memberEyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">
          {t('memberTitle')}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-gray-400">
          {t('memberDescription')}
        </p>
      </div>

      {boards.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-10 text-center">
          <BookOpen size={30} className="mx-auto text-gray-600" />
          <p className="mt-3 text-sm text-gray-400">{t('emptyPublishedBoards')}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/tactics/${board.id}`}
              className="rounded-xl border border-gray-800 bg-gray-950 p-4 transition-colors hover:border-amber-500/60"
            >
              <p className="truncate text-base font-semibold text-white">{board.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                {board.summary || t('noSummary')}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <FileText size={13} />
                  {t('stepCount', { count: board.stepCount })}
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
