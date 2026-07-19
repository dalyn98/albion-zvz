import type { ReactNode } from 'react'
import ScopedIntlProvider from '@/components/ScopedIntlProvider'
import { APP_ROUTE_CLIENT_MESSAGE_NAMESPACES } from '@/lib/client-messages'

export default function CraftLayout({ children }: { children: ReactNode }) {
  return (
    <ScopedIntlProvider namespaces={APP_ROUTE_CLIENT_MESSAGE_NAMESPACES.craft}>
      {children}
    </ScopedIntlProvider>
  )
}
