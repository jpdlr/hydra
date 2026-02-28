import { useEffect, useRef, useState } from 'react'

interface ScannerProps {
  onScan: (data: string) => void
}

export function Scanner({ onScan }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [manualInput, setManualInput] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let animationId: number
    let scanning = true

    async function startCamera() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        // Use BarcodeDetector API (available in Chrome, Safari)
        if ('BarcodeDetector' in window) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] })

          const scanFrame = async () => {
            if (!scanning || !videoRef.current) return

            try {
              const barcodes = await detector.detect(videoRef.current)
              if (barcodes.length > 0) {
                onScan(barcodes[0].rawValue)
                scanning = false
                return
              }
            } catch {
              // Frame detection failed, try again
            }

            animationId = requestAnimationFrame(scanFrame)
          }

          animationId = requestAnimationFrame(scanFrame)
        } else {
          setError('QR scanning not supported in this browser. Paste the QR payload below.')
        }
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
      cancelAnimationFrame(animationId)
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
