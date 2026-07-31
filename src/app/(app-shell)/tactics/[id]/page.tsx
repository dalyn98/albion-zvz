import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { sessionCanManageTactics, sessionCanViewTactics } from '@/lib/tactics/access'
import {
  loadPublishedTacticBoardDocument,
  loadTacticBoardDocument,
} from '@/lib/tactics/queries'
import TacticViewer from '@/components/tactics/TacticViewer'
import { isTacticsExperimentalEnabled } from '@/lib/tactics/feature-server'

export const dynamic = 'force-dynamic'

export default async function TacticViewerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const [{ id }, session] = await Promise.all([params, getSession()])
  if (!session) redirect('/')
  if (!sessionCanViewTactics(session)) redirect('/')
  const guildId = await getSessionGuildId(session)
  if (!(await isTacticsExperimentalEnabled(guildId))) redirect('/')
  const canManage = sessionCanManageTactics(session)
  const document = canManage
    ? await loadTacticBoardDocument(guildId, id)
    : await loadPublishedTacticBoardDocument(guildId, id)
  if (!document) notFound()

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-6xl mx-auto w-full">
      <TacticViewer document={document} showAdminLink={canManage} />
    </main>
  )
}
