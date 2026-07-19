import MarketingFooter from '@/components/MarketingFooter'
import ScopedIntlProvider from '@/components/ScopedIntlProvider'
import { APP_ROUTE_CLIENT_MESSAGE_NAMESPACES } from '@/lib/client-messages'

export default function MarketingGuildProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ScopedIntlProvider namespaces={APP_ROUTE_CLIENT_MESSAGE_NAMESPACES.publicMarketing}>
      {children}
      <MarketingFooter />
    </ScopedIntlProvider>
  )
}
