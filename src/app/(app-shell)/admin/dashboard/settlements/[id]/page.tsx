import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminSettlementDetailRedirectPage() {
  redirect('/admin/dashboard/approvals')
}
