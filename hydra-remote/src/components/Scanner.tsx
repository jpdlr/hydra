import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'

interface ScannerProps {
  onScan: (data: string) => void
}

export function Scanner({ onScan }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let animationId: number | null = null
    let scanning = true

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })

        const videoEl = videoRef.current
        if (!videoEl) return

        videoEl.srcObject = stream
        await videoEl.play()

        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          setError('Could not initialize camera scanner. Paste the QR payload below.')
          return
        }

        // Prefer native detector when available, fallback to jsQR for Safari compatibility.
        type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
          detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>
        }

        let nativeDetector: InstanceType<BarcodeDetectorCtor> | null = null
        if ('BarcodeDetector' in window) {
          try {
            const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
            if (Detector) nativeDetector = new Detector({ formats: ['qr_code'] })
          } catch {
            nativeDetector = null
          }
        }

        const scanFrame = async () => {
          if (!scanning) return
          const video = videoRef.current
          if (!video) return

          if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
            animationId = requestAnimationFrame(() => {
              void scanFrame()
            })
            return
          }

          const width = video.videoWidth
          const height = video.videoHeight
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
          }

          try {
            if (nativeDetector) {
              const barcodes = await nativeDetector.detect(video)
              const rawValue = barcodes[0]?.rawValue
              if (rawValue) {
                scanning = false
                onScan(rawValue)
                return
              }
            } else {
              context.drawImage(video, 0, 0, width, height)
              const image = context.getImageData(0, 0, width, height)
              const decoded = jsQR(image.data, width, height, { inversionAttempts: 'attemptBoth' })
              if (decoded?.data) {
                scanning = false
                onScan(decoded.data)
                return
              }
            }
          } catch {
            // Ignore frame decode errors and keep scanning.
          }

          animationId = requestAnimationFrame(() => {
            void scanFrame()
          })
        }

        animationId = requestAnimationFrame(() => {
          void scanFrame()
        })
      } catch (err) {
        setError(
          err instanceof Error
            ? `Camera error: ${err.message}`
            : 'Could not access camera. Paste the QR payload below.'
        )
      }
    }

    void startCamera()

    return () => {
      scanning = false
      if (animationId !== null) cancelAnimationFrame(animationId)
      if (stream) {
        stream.getTracks().forEach((t) => t.stop())
      }
    }
  }, [onScan])

  return (
    <div style={containerStyle}>
      {!error && (
        <video
          ref={videoRef}
          style={videoStyle}
          playsInline
          muted
        />
      )}

      {error && (
        <div style={fallbackStyle}>
          <p style={{ color: '#a0a0a0', fontSize: '0.8125rem', marginBottom: 12 }}>{error}</p>
          <textarea
            style={textareaStyle}
            placeholder='Paste QR payload JSON here...'
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            rows={4}
          />
          <button
            style={connectBtnStyle}
            onClick={() => {
              if (manualInput.trim()) onScan(manualInput.trim())
            }}
          >
            Connect
          </button>
        </div>
      )}

      <p style={hintStyle}>Point your camera at the QR code on your desktop</p>
    </div>
  )
}

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 16,
  padding: 20,
  width: '100%',
  maxWidth: 400,
  margin: '0 auto'
}

const videoStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 300,
  aspectRatio: '1',
  objectFit: 'cover',
  borderRadius: 12,
  border: '2px solid #333'
}

const fallbackStyle: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 8
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  padding: 12,
  background: '#232323',
  border: '1px solid #333',
  borderRadius: 8,
  color: '#e8e8e8',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  resize: 'none'
}

const connectBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#e8e8e8',
  color: '#191919',
  border: 'none',
  borderRadius: 8,
  fontWeight: 600,
  fontSize: '0.875rem',
  cursor: 'pointer'
}

const hintStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#666'
}
