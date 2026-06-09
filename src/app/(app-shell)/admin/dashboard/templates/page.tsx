import { redirect } from 'next/navigation'

// 템플릿 목록은 이벤트 대시보드의 탭으로 통합됐습니다. 기존 북마크 호환용 리다이렉트.
export default function TemplatesRedirect() {
  redirect('/admin/dashboard?section=templates')
}
