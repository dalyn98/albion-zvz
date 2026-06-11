import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHasAny } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { TACTIC_PUBLISH_CAPS } from '@/lib/tactics/access'
import { loadTacticBoardDocument } from '@/lib/tactics/queries'
import TacticEditor from '@/components/tactics/TacticEditor'

export const dynamic = 'force-dynamic'

export default async function TacticEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, session, t] = await Promise.all([
    params,
    getSession(),
    getTranslations('tactics'),
  ])
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  const document = await loadTacticBoardDocument(guildId, id)
  if (!document) notFound()

  return (
    <div className="space-y-4">
      <Link
        href="/admin/dashboard/tactics"
        className="inline-flex items-center gap-1 text-sm font-semibold text-gray-400 hover:text-white"
      >
        <ChevronLeft size={15} />
        {t('backToList')}
      </Link>
      <TacticEditor
        key={`${document.board.updatedAt}:${document.steps.map((step) => step.updatedAt).join('|')}`}
        document={document}
        canPublish={sessionHasAny(session, TACTIC_PUBLISH_CAPS)}
      />
    </div>
  )
}
