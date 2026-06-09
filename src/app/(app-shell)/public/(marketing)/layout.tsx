import MarketingFooter from '@/components/MarketingFooter'

export default function MarketingGuildProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
      <MarketingFooter />
    </>
  )
}
