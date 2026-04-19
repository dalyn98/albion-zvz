import { getSession } from '@/lib/session'
import AppSidebar from './AppSidebar'

export default async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  return (
    <div className="flex flex-col lg:flex-row min-h-screen w-full">
      <AppSidebar session={session} />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  )
}
