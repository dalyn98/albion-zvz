import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminSettlementsRedirectPage() {
  redirect('/admin/dashboard/approvals')
}
