import AdminEventWorkspace from '@/components/AdminEventWorkspace'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>
}) {
  const { section } = await searchParams
  return <AdminEventWorkspace section={section} />
}
