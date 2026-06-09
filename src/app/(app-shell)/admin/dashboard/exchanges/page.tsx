import { redirect } from 'next/navigation'

// 환전 승인은 승인 관리 페이지로 통합됐습니다. 기존 북마크/링크 호환용 리다이렉트.
export default async function ExchangesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const { scope } = await searchParams
  const query = scope === 'all' ? '&scope=all' : ''
  redirect(`/admin/dashboard/approvals?tab=exchange${query}`)
}
