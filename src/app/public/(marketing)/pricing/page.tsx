import { redirect } from 'next/navigation'
import { getMarketingPaths } from '@/lib/marketing-paths'

export const dynamic = 'force-dynamic'

export default async function PublicPricingPage() {
  const paths = await getMarketingPaths()
  redirect(paths.home)
}
