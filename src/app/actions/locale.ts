'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'

export async function setLocaleAction(formData: FormData): Promise<void> {
  const next = formData.get('locale')
  if (typeof next !== 'string' || !isLocale(next)) return

  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  cookieStore.set(LOCALE_COOKIE, next, localeCookieOptions(headerStore.get('host')))
  revalidatePath('/', 'layout')
}
