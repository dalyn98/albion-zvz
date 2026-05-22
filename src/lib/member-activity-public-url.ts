import { getCanonicalRootDomain } from '@/lib/tenant-resolver'

export function buildPublicActivityUrl(token: string): string {
  return `https://${getCanonicalRootDomain()}/u/${token}`
}
