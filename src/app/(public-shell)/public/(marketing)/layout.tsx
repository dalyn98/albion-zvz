import MarketingFooter from '@/components/MarketingFooter'

// 마케팅 페이지는 root layout 의 isMarketing 분기 덕분에 PublicShell/AppShell
// 없이 children 만 렌더된다. 헤더는 각 page 가 <MarketingNav active=".." /> 로
// 직접 깔고, 푸터는 모든 마케팅 페이지에서 동일하므로 이 layout 에서 한 번만
// 붙인다 (active 키는 layout 단에서 알 수 없어 nav 는 page 책임).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <MarketingFooter />
    </>
  )
}
