'use client'

import { NextIntlClientProvider } from 'next-intl'
import type { ComponentProps } from 'react'
import { getIntlMessageFallback } from '@/lib/i18n-fallback'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'

type SafeIntlProviderProps = ComponentProps<typeof NextIntlClientProvider>

export default function SafeIntlProvider(props: SafeIntlProviderProps) {
  return (
    <NextIntlClientProvider
      {...props}
      timeZone={props.timeZone ?? DEFAULT_TENANT_TIMEZONE}
      getMessageFallback={(info) => getIntlMessageFallback(info)}
      onError={handleIntlError}
    />
  )
}

function handleIntlError(error: Error & { code?: string }): void {
  if (process.env.NODE_ENV !== 'production') {
    console.error(error)
    return
  }

  if (error.code === 'MISSING_MESSAGE') {
    console.warn('Missing i18n message', {
      code: error.code,
      message: error.message,
    })
    return
  }

  console.error(error)
}
