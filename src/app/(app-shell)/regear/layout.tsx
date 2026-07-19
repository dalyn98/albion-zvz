import type { ReactNode } from 'react'
import ScopedIntlProvider from '@/components/ScopedIntlProvider'
import { APP_ROUTE_CLIENT_MESSAGE_NAMESPACES } from '@/lib/client-messages'

export default function RegearLayout({ children }: { children: ReactNode }) {
  return (
    <ScopedIntlProvider namespaces={APP_ROUTE_CLIENT_MESSAGE_NAMESPACES.regear}>
      {children}
    </ScopedIntlProvider>
  )
}
