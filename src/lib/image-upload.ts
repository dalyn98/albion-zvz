export const IMAGE_UPLOAD_TYPES = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
} as const

export type ImageUploadMime = (typeof IMAGE_UPLOAD_TYPES)[keyof typeof IMAGE_UPLOAD_TYPES]

const IMAGE_EXT_BY_MIME: Record<ImageUploadMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export interface ImageUploadValidationResult {
  ok: true
  file: File
  mime: ImageUploadMime
  ext: string
}

export type ImageUploadValidationError =
  | 'missing'
  | 'empty'
  | 'tooLarge'
  | 'wrongType'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const GIF87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]
const GIF89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]

function byteEquals(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  if (bytes.length < offset + signature.length) return false
  return signature.every((value, index) => bytes[offset + index] === value)
}

function matchesImageSignature(mime: ImageUploadMime, bytes: Uint8Array): boolean {
  switch (mime) {
    case 'image/png':
      return byteEquals(bytes, PNG_SIGNATURE)
    case 'image/jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        byteEquals(bytes, [0x52, 0x49, 0x46, 0x46]) &&
        byteEquals(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      )
    case 'image/gif':
      return byteEquals(bytes, GIF87A_SIGNATURE) || byteEquals(bytes, GIF89A_SIGNATURE)
  }
}

function normalizeAllowedTypes(allowedTypes: ReadonlySet<string> | readonly string[]): Set<ImageUploadMime> {
  const values = allowedTypes instanceof Set ? [...allowedTypes] : [...allowedTypes]
  return new Set(
    values.filter((value): value is ImageUploadMime =>
      Object.values(IMAGE_UPLOAD_TYPES).includes(value as ImageUploadMime),
    ),
  )
}

export function imageExtFromMime(mime: ImageUploadMime): string {
  return IMAGE_EXT_BY_MIME[mime]
}

export async function validateImageUploadFile(
  value: unknown,
  options: {
    allowedTypes: ReadonlySet<string> | readonly string[]
    maxBytes: number
  },
): Promise<ImageUploadValidationResult | { ok: false; error: ImageUploadValidationError }> {
  if (!(value instanceof File)) return { ok: false, error: 'missing' }
  if (value.size === 0) return { ok: false, error: 'empty' }
  if (value.size > options.maxBytes) return { ok: false, error: 'tooLarge' }

  const allowed = normalizeAllowedTypes(options.allowedTypes)
  const mime = value.type as ImageUploadMime
  if (!allowed.has(mime)) return { ok: false, error: 'wrongType' }

  const header = new Uint8Array(await value.slice(0, 16).arrayBuffer())
  if (!matchesImageSignature(mime, header)) return { ok: false, error: 'wrongType' }

  return {
    ok: true,
    file: value,
    mime,
    ext: imageExtFromMime(mime),
  }
}
