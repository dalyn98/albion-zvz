import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

// Maskable icon has a ~40% safe zone — Android/iOS mask the outer corners.
// We pad the foreground so the character stays visible after masking.
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
          fontSize: 220,
          fontWeight: 900,
          letterSpacing: -8,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        M
      </div>
    ),
    { ...size },
  )
}
