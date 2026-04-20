import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f1117',
          color: '#f59e0b',
          fontSize: 320,
          fontWeight: 900,
          letterSpacing: -10,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        M
      </div>
    ),
    { ...size },
  )
}
