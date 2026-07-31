import { notFound } from 'next/navigation'
import { loadTacticBoardDocumentByShareToken } from '@/lib/tactics/queries'
import TacticViewer from '@/components/tactics/TacticViewer'

export const dynamic = 'force-dynamic'

export default async function PublicTacticSharePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const document = await loadTacticBoardDocumentByShareToken(token)
  if (!document) notFound()

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-10">
      <TacticViewer document={document} shared />
    </main>
  )
}
