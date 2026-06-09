import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function MyWalletRedirectPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me/wallet')
  }
  if (!session.isMember) {
    redirect('/')
  }
  redirect('/me#wallet')
}
