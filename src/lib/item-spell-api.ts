export const MAX_SPELL_IDS_PER_REQUEST = 64
export const MAX_SPELL_ID_LENGTH = 80

const ITEM_ID_RE = /^[A-Z0-9_@]+$/i

export function normalizeSpellItemIds(ids: string[]): string[] {
  const normalized: string[] = []
  for (const raw of ids) {
    const id = raw.trim()
    if (!id || id.length > MAX_SPELL_ID_LENGTH || !ITEM_ID_RE.test(id)) continue
    if (!normalized.includes(id)) normalized.push(id)
    if (normalized.length >= MAX_SPELL_IDS_PER_REQUEST) break
  }
  return normalized
}

export function chunkSpellItemIds(ids: string[]): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += MAX_SPELL_IDS_PER_REQUEST) {
    chunks.push(ids.slice(i, i + MAX_SPELL_IDS_PER_REQUEST))
  }
  return chunks
}
