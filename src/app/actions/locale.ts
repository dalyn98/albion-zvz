'use server'

import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { LOCALE_COOKIE, isLocale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'
import { replaceSeoFeatureLocale } from '@/lib/seo-locale-paths'

export async function setLocaleAction(formData: FormData): Promise<void> {
  const next = formData.get('locale')
  if (typeof next !== 'string' || !isLocale(next)) return
  const returnTo = formData.get('returnTo')
  const redirectTo =
    typeof returnTo === 'string' ? replaceSeoFeatureLocale(returnTo, next) : null

  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  cookieStore.set(LOCALE_COOKIE, next, localeCookieOptions(headerStore.get('host')))
  revalidatePath('/', 'layout')
  if (redirectTo) redirect(redirectTo)
}
