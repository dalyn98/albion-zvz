const ALBION_ITEM_RENDER_BASE = 'https://render.albiononline.com/v1/item'
const ENCHANT_SUFFIX_RE = /@\d+$/

export interface AlbionItemImageUrlInput {
  uniqueName: string
  enchant?: number | null
  quality?: number | null
  size?: number | null
}

export function normalizeAlbionItemImageId(
  uniqueName: string,
  enchant?: number | null,
): string {
  const trimmed = uniqueName.trim()
  if (!trimmed) return ''

  if (enchant === undefined || enchant === null) return trimmed

  const base = trimmed.replace(ENCHANT_SUFFIX_RE, '')
  return enchant > 0 ? `${base}@${enchant}` : base
}

export function buildAlbionItemImageUrl({
  uniqueName,
  enchant,
  quality,
  size = 60,
}: AlbionItemImageUrlInput): string {
  const itemId = normalizeAlbionItemImageId(uniqueName, enchant)
  const params = new URLSearchParams()
  if (quality !== undefined && quality !== null) params.set('quality', String(quality))
  if (size !== undefined && size !== null) params.set('size', String(size))
  const query = params.toString()
  return `${ALBION_ITEM_RENDER_BASE}/${encodeURIComponent(itemId)}.png${query ? `?${query}` : ''}`
}

export function buildAlbionItemImageUrlCandidates(input: AlbionItemImageUrlInput): string[] {
  const primaryId = normalizeAlbionItemImageId(input.uniqueName, input.enchant)
  if (!primaryId) return []

  const candidates: string[] = []
  const add = (urlInput: AlbionItemImageUrlInput) => {
    const url = buildAlbionItemImageUrl(urlInput)
    if (!candidates.includes(url)) candidates.push(url)
  }

  add(input)
  add({ ...input, quality: null })

  const baseId = primaryId.replace(ENCHANT_SUFFIX_RE, '')
  if (baseId !== primaryId) {
    add({ uniqueName: baseId, quality: input.quality, size: input.size })
    add({ uniqueName: baseId, quality: null, size: input.size })
  }

  return candidates
}
