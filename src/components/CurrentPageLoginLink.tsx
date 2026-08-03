'use client'

import { LogIn } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  buildLoginEntryHref,
  resolveCurrentPageLoginReturnTo,
} from '@/lib/login-entry'

export default function CurrentPageLoginLink({ label }: { label: string }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (pathname === '/login') return null

  const returnTo = resolveCurrentPageLoginReturnTo(
    pathname || '/',
    searchParams.entries(),
  )

  return (
    <a
      href={buildLoginEntryHref({ returnTo })}
      className="flex min-h-10 items-center gap-1 rounded-lg bg-[#4752c4] px-3 text-xs font-semibold text-white transition-[background-color,transform] hover:bg-[#3c45a5] active:scale-[0.96]"
    >
      <LogIn size={12} />
      {label}
    </a>
  )
}
