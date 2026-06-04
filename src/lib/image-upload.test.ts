import { describe, expect, it } from 'vitest'
import { IMAGE_UPLOAD_TYPES, validateImageUploadFile } from './image-upload'

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00])
const webpBytes = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])
const gifBytes = new TextEncoder().encode('GIF89a')

describe('validateImageUploadFile', () => {
  it('accepts allowed image types only when the file signature matches', async () => {
    await expect(
      validateImageUploadFile(new File([pngBytes], 'image.png', { type: IMAGE_UPLOAD_TYPES.png }), {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({ ok: true, mime: 'image/png', ext: 'png' })

    await expect(
      validateImageUploadFile(new File([jpgBytes], 'image.jpg', { type: IMAGE_UPLOAD_TYPES.jpeg }), {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({ ok: true, mime: 'image/jpeg', ext: 'jpg' })

    await expect(
      validateImageUploadFile(new File([webpBytes], 'image.webp', { type: IMAGE_UPLOAD_TYPES.webp }), {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({ ok: true, mime: 'image/webp', ext: 'webp' })

    await expect(
      validateImageUploadFile(new File([gifBytes], 'image.gif', { type: IMAGE_UPLOAD_TYPES.gif }), {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1024,
      }),
    ).resolves.toMatchObject({ ok: true, mime: 'image/gif', ext: 'gif' })
  })

  it('rejects spoofed content types and disallowed formats', async () => {
    await expect(
      validateImageUploadFile(new File(['<svg></svg>'], 'spoof.png', { type: 'image/png' }), {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1024,
      }),
    ).resolves.toEqual({ ok: false, error: 'wrongType' })

    await expect(
      validateImageUploadFile(new File([gifBytes], 'image.gif', { type: IMAGE_UPLOAD_TYPES.gif }), {
        allowedTypes: [IMAGE_UPLOAD_TYPES.png],
        maxBytes: 1024,
      }),
    ).resolves.toEqual({ ok: false, error: 'wrongType' })
  })

  it('rejects missing, empty, and oversized files', async () => {
    await expect(
      validateImageUploadFile(null, {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1024,
      }),
    ).resolves.toEqual({ ok: false, error: 'missing' })

    await expect(
      validateImageUploadFile(new File([], 'empty.png', { type: IMAGE_UPLOAD_TYPES.png }), {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1024,
      }),
    ).resolves.toEqual({ ok: false, error: 'empty' })

    await expect(
      validateImageUploadFile(new File([pngBytes], 'image.png', { type: IMAGE_UPLOAD_TYPES.png }), {
        allowedTypes: Object.values(IMAGE_UPLOAD_TYPES),
        maxBytes: 1,
      }),
    ).resolves.toEqual({ ok: false, error: 'tooLarge' })
  })
})
