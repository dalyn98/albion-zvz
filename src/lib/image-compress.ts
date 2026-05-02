// 모바일 사용자가 갤러리에서 그대로 첨부한 4-8MB 짜리 사진은 server action
// bodySizeLimit (10MB) + Supabase bucket (10MB) 한도에 걸려 신청이 throw 로
// 떨어지고 error.tsx 가 발동된다 (ASD 모바일 리기어 케이스). 클라이언트에서
// 사전에 다운스케일 + JPEG 재인코딩으로 작게 만들어 그 한도 안에서 안전하게
// 업로드되도록 한다.

const COMPRESS_TRIGGER_BYTES = 1.5 * 1024 * 1024 // 1.5 MB 넘는 입력만 압축
const MAX_DIM = 2400 // 가로/세로 중 큰 쪽을 이 값으로 다운스케일
const QUALITY = 0.85

const COMPRESSIBLE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export async function compressImageIfLarge(file: File): Promise<File> {
  if (typeof window === 'undefined') return file
  if (!COMPRESSIBLE_TYPES.has(file.type)) return file
  if (file.size <= COMPRESS_TRIGGER_BYTES) return file

  try {
    const compressed = await reencodeAsJpeg(file)
    if (!compressed) return file
    if (compressed.size >= file.size) return file
    return compressed
  } catch {
    return file
  }
}

async function reencodeAsJpeg(file: File): Promise<File | null> {
  const dataUrl = await readAsDataURL(file)
  const img = await loadImage(dataUrl)
  const { width, height } = scaleDownToMax(img.naturalWidth, img.naturalHeight, MAX_DIM)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, width, height)

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  )
  if (!blob) return null

  const baseName = file.name.replace(/\.[^.]+$/, '')
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

function scaleDownToMax(w: number, h: number, max: number): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h }
  if (w >= h) {
    const ratio = h / w
    return { width: max, height: Math.round(max * ratio) }
  }
  const ratio = w / h
  return { width: Math.round(max * ratio), height: max }
}
