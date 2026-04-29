// 공개 길드 프로필 갤러리 — hero 아래 그리드로 노출되는 N장 이미지.
// 한 길드당 최대 6장. 어드민 폼 / 공개 페이지 둘 다 같은 로더를 쓴다.

import { getAdminClient } from '@/lib/supabase-admin'

export const GALLERY_MAX_ITEMS = 6

export interface GalleryItem {
  id: string
  position: number
  imageUrl: string
  caption: string
}

export async function loadGalleryItems(guildId: string): Promise<GalleryItem[]> {
  const db = getAdminClient()
  const { data } = await db
    .from('guild_profile_gallery_items')
    .select('id, position, image_url, caption')
    .eq('guild_id', guildId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })

  if (!data) return []
  return data.map((row) => ({
    id: row.id as string,
    position: (row.position as number) ?? 0,
    imageUrl: (row.image_url as string) ?? '',
    caption: (row.caption as string) ?? '',
  }))
}
