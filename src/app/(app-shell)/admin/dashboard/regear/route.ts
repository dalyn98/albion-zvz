import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 리기어 승인은 승인 관리 페이지로 통합됐다. 레이아웃을 렌더링하기 전에
// HTTP 리다이렉트를 반환해 기존 북마크와 링크를 안정적으로 지원한다.
export function GET(request: NextRequest) {
  const target = request.nextUrl.clone()
  const includeAllScopes = target.searchParams.get('scope') === 'all'
  target.pathname = '/admin/dashboard/approvals'
  target.search = ''
  target.searchParams.set('origin', 'all')
  if (includeAllScopes) target.searchParams.set('scope', 'all')
  return NextResponse.redirect(target)
}
