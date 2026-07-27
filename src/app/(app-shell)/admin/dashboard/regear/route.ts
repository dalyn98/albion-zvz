import { type NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// 리기어 승인은 승인 관리 페이지로 통합됐다. 레이아웃을 렌더링하기 전에
// HTTP 리다이렉트를 반환해 기존 북마크와 링크를 안정적으로 지원한다.
export function GET(request: NextRequest) {
  const searchParams = new URLSearchParams({ origin: 'all' })
  if (request.nextUrl.searchParams.get('scope') === 'all') {
    searchParams.set('scope', 'all')
  }

  // 상대 Location을 사용해 reverse proxy 내부 바인딩 주소(예: 0.0.0.0)가
  // 외부 리다이렉트 URL에 새어 나가 세션 쿠키가 끊기는 일을 막는다.
  return new NextResponse(null, {
    status: 307,
    headers: {
      Location: `/admin/dashboard/approvals?${searchParams}`,
    },
  })
}
