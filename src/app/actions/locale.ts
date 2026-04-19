'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export async function setLocaleAction(formData: FormData): Promise<void> {
  const next = formData.get('locale')
  if (typeof next !== 'string' || !isLocale(next)) return

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, next, {
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
}
