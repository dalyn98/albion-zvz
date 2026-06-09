import { redirect } from 'next/navigation'

// 역할금액 설정은 통합 설정 페이지로 이동했습니다. 기존 북마크/링크 호환을 위해 리다이렉트 유지.
export default function RoleRewardsRedirect() {
  redirect('/admin/dashboard/settings?tab=regear')
}
