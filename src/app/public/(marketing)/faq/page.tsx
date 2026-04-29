import { redirect } from 'next/navigation'
import { getMarketingPaths } from '@/lib/marketing-paths'

export const dynamic = 'force-dynamic'

export default async function PublicFaqPage() {
  const paths = await getMarketingPaths()
  redirect(paths.faq)
}
