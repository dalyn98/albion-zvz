'use client'

import { useCallback, useEffect, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useTranslations } from 'next-intl'
import { ZoomIn, ZoomOut, RotateCw, Check, X } from 'lucide-react'

interface ImageCropModalProps {
  // 모달을 띄울 원본 파일. null 이면 닫힘.
  file: File | null
  // 출력 가로/세로 비율. 16/9 등. 자유 비율은 undefined.
  aspect?: number
  // 적용 후 결과 File 을 부모에게 넘긴다. 원본 파일명·MIME 유지.
  onApply: (croppedFile: File) => void
  onCancel: () => void
}

interface CropArea {
  width: number
  height: number
  x: number
  y: number
}

// 외부에서 file 이 null 이면 컴포넌트 자체를 unmount 시켜 내부 상태가 자연스럽게
// 리셋되도록 wrapper 와 inner 를 분리한다 (effect 내부 setState 회피).
export default function ImageCropModal(props: ImageCropModalProps) {
  if (!props.file) return null
  return <ImageCropModalInner {...props} file={props.file} />
}

interface InnerProps extends Omit<ImageCropModalProps, 'file'> {
  file: File
}

function ImageCropModalInner({ file, aspect, onApply, onCancel }: InnerProps) {
  const t = useTranslations('imageCrop')
  const [imageSrc] = useState(() => URL.createObjectURL(file))
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(imageSrc)
    }
  }, [imageSrc])

  const handleCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels)
  }, [])

  const handleApply = useCallback(async () => {
    if (!croppedAreaPixels) return
    setBusy(true)
    setError('')
    try {
      const blob = await cropImageToBlob(imageSrc, croppedAreaPixels, rotation, file.type)
      const croppedFile = new File([blob], file.name, {
        type: blob.type || file.type,
        lastModified: Date.now(),
      })
      onApply(croppedFile)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('cropFailed'))
    } finally {
      setBusy(false)
    }
  }, [file, imageSrc, croppedAreaPixels, rotation, onApply, t])

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !busy) onCancel()
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="font-bold text-white text-base">{t('title')}</h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-gray-400 hover:text-white p-1 disabled:opacity-40"
            aria-label={t('cancel')}
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative bg-black flex-1 min-h-[280px] sm:min-h-[420px]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={aspect}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={handleCropComplete}
            objectFit="contain"
            restrictPosition={false}
            showGrid={true}
          />
        </div>

        <div className="px-5 py-3 border-t border-gray-800 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-gray-300 flex-1 min-w-[180px]">
              <ZoomOut size={14} className="text-gray-500" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-amber-500"
                aria-label={t('zoom')}
              />
              <ZoomIn size={14} className="text-gray-500" />
            </label>
            <button
              type="button"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              disabled={busy}
              className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 px-3 py-1.5 rounded disabled:opacity-40"
              title={t('rotate')}
            >
              <RotateCw size={13} />
              {t('rotate')}
            </button>
          </div>

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex items-center justify-between gap-2">
            <p className="text-gray-500 text-[11px]">{t('hint')}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="text-xs text-gray-300 hover:text-white px-3 py-1.5 disabled:opacity-40"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={busy || !croppedAreaPixels}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black font-bold px-4 py-1.5 rounded-lg text-xs"
              >
                <Check size={13} />
                {busy ? t('applying') : t('apply')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 캔버스로 잘라낸 이미지를 동일 MIME 타입으로 Blob 으로 반환.
// rotation 이 들어오면 캔버스 회전 후 자르므로 출력 픽셀 좌표계는 회전된 이미지 기준.
async function cropImageToBlob(
  imageSrc: string,
  area: CropArea,
  rotation: number,
  mimeType: string,
): Promise<Blob> {
  const image = await loadImage(imageSrc)
  const radians = (rotation * Math.PI) / 180

  // 회전된 이미지 전체를 그릴 임시 캔버스. width/height 를 회전 후 박스에 맞춘다.
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const rotatedWidth = image.width * cos + image.height * sin
  const rotatedHeight = image.width * sin + image.height * cos

  const rotatedCanvas = document.createElement('canvas')
  rotatedCanvas.width = rotatedWidth
  rotatedCanvas.height = rotatedHeight
  const rotatedCtx = rotatedCanvas.getContext('2d')
  if (!rotatedCtx) throw new Error('canvas-2d-unsupported')
  rotatedCtx.translate(rotatedWidth / 2, rotatedHeight / 2)
  rotatedCtx.rotate(radians)
  rotatedCtx.drawImage(image, -image.width / 2, -image.height / 2)

  // 잘라낼 영역만 새 캔버스에 복사.
  const outCanvas = document.createElement('canvas')
  outCanvas.width = area.width
  outCanvas.height = area.height
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) throw new Error('canvas-2d-unsupported')
  outCtx.drawImage(
    rotatedCanvas,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  )

  // gif 는 caller 가 정적 PNG 로 변환되더라도 무방. animate 보존 여기선 미지원.
  const exportMime = mimeType === 'image/gif' ? 'image/png' : mimeType
  return await new Promise<Blob>((resolve, reject) => {
    outCanvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('canvas-toblob-failed'))
          return
        }
        resolve(blob)
      },
      exportMime,
      0.92,
    )
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image-load-failed'))
    img.src = src
  })
}
