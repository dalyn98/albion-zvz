import { revalidateTag, updateTag } from 'next/cache'

export const TENANT_DIRECTORY_CACHE_TAG = 'tenant-directory'
export const TENANT_DIRECTORY_CACHE_SECONDS = 60

export function invalidateTenantDirectoryCache(): void {
  updateTag(TENANT_DIRECTORY_CACHE_TAG)
}

export function revalidateTenantDirectoryCache(): void {
  revalidateTag(TENANT_DIRECTORY_CACHE_TAG, 'max')
}
