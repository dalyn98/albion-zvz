import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LegacyShopBaselinePage() {
  redirect('/admin/dashboard/shop/recovery')
}
