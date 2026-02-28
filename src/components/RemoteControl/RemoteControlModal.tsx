import { useEffect, useRef, useState } from 'react'
import type { RemoteControlState } from '@shared/types'
import styles from './RemoteControlModal.module.css'

interface RemoteControlModalProps {
  state: RemoteControlState
  loading: boolean
  onEnable: () => void
  onDisable: () => void
  onClose: () => void
}

export function RemoteControlModal({
  state,
  loading,
  onEnable,
  onDisable,
  onClose
}: RemoteControlModalProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [qrStatus, setQrStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [qrError, setQrError] = useState<string | null>(null)
  const [qrRenderNonce, setQrRenderNonce] = useState(0)
  const showActiveSession = state.enabled && state.status === 'active'
  const showEnableAction =
    !state.enabled &&
    !loading &&
    (state.status === 'disconnected' || state.status === 'expired')
  const showCreatingState = (loading && !state.enabled) || state.status === 'creating'

  // Generate QR code when payload is available
  useEffect(() => {
    const qrPayload = state.qrPayload
    if (!qrPayload) {
      setQrStatus('idle')
      setQrError(null)
      return
    }

    if (!showActiveSession) {
      setQrStatus('loading')
      setQrError(null)
      return
    }

    let cancelled = false
    setQrStatus('loading')
    setQrError(null)

    import('qrcode')
      .then((module) => {
        const toCanvas = module.toCanvas
        if (!toCanvas) throw new Error('QR renderer unavailable')
        const canvas = qrCanvasRef.current
        if (!canvas) throw new Error('Canvas not ready')
        return toCanvas(canvas, qrPayload, {
          width: 200,
          margin: 1,
          errorCorrectionLevel: 'L',
          color: { dark: '#000000', light: '#ffffff' }
        })
      })
      .then(() => {
        if (!cancelled) setQrStatus('ready')
      })
      .catch((err) => {
        if (!cancelled) {
          setQrStatus('error')
          const message = err instanceof Error ? err.message : 'Unknown QR error'
          setQrError(`Could not render QR image (${message}). Retry or copy session payload below.`)
        }
      })

    return () => {
      cancelled = true
    }
  }, [state.qrPayload, showActiveSession, qrRenderNonce])

  const statusLabel = getStatusLabel(state)
  const statusClass = getStatusClass(state)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Remote Control</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {/* Not enabled — show enable button */}
          {showEnableAction && (
            <>
              <p className={styles.hint}>
                Control your Hydra agents from a mobile device.
                A QR code will be generated for your phone to scan.
              </p>
              <div className={styles.actions}>
                <button
                  className={styles.enableBtn}
                  onClick={onEnable}
                  disabled={loading}
                >
                  Enable Remote Control
                </button>
              </div>
            </>
          )}

          {/* Creating session */}
          {showCreatingState && (
            <>
              <div className={styles.spinner} />
              <p className={styles.hint}>
                {loading && !state.enabled ? 'Enabling remote control...' : 'Creating session...'}
              </p>
            </>
          )}

          {/* Active with QR code */}
          {showActiveSession && (
            <>
              <div className={styles.statusRow}>
                <span className={`${styles.statusDot} ${statusClass}`} />
                <span>{statusLabel}</span>
              </div>

              <div className={styles.qrContainer}>
                <canvas
                  ref={qrCanvasRef}
                  className={styles.qrCanvas}
                  width={200}
                  height={200}
                  aria-label="Remote control QR code"
                />
                {qrStatus === 'loading' && (
                  <div className={styles.qrOverlay} role="status" aria-live="polite">
                    <div className={styles.spinner} />
                    <p className={styles.hint}>Generating QR code...</p>
                  </div>
                )}
                {qrStatus === 'error' && (
                  <div className={styles.qrOverlayError}>
                    <p className={styles.errorMsg}>{qrError}</p>
                  </div>
                )}
              </div>

              <div className={styles.info}>
                <div className={styles.infoRow}>
                  <span>Session</span>
                  <span className={styles.infoValue}>
                    {state.sessionId?.slice(0, 8) ?? '—'}
                  </span>
                </div>
                <div className={styles.infoRow}>
                  <span>Mobile</span>
                  <span className={styles.infoValue}>
                    {state.mobileConnected ? 'Connected' : 'Waiting...'}
                  </span>
                </div>
                {state.expiresAt && (
                  <div className={styles.infoRow}>
                    <span>Expires</span>
                    <span className={styles.infoValue}>
                      {new Date(state.expiresAt).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>

              <p className={styles.hint}>
                Scan this QR code with the Hydra Remote app on your phone.
              </p>
              {qrStatus === 'error' && state.qrPayload && (
                <textarea
                  className={styles.payloadBox}
                  value={state.qrPayload}
                  readOnly
                  aria-label="Remote session payload fallback"
                />
              )}

              <div className={styles.actions}>
                {qrStatus === 'error' && (
                  <button
                    className={styles.enableBtn}
                    onClick={() => setQrRenderNonce((value) => value + 1)}
                    disabled={loading}
                  >
                    Regenerate QR
                  </button>
                )}
                <button
                  className={styles.disableBtn}
                  onClick={onDisable}
                  disabled={loading}
                >
                  Disconnect
                </button>
              </div>
            </>
          )}

          {/* Error state */}
          {state.status === 'error' && (
            <>
              <div className={styles.statusRow}>
                <span className={`${styles.statusDot} ${styles.statusError}`} />
                <span>Error</span>
              </div>
              {state.error && <p className={styles.errorMsg}>{state.error}</p>}
              <div className={styles.actions}>
                <button
                  className={styles.enableBtn}
                  onClick={onEnable}
                  disabled={loading}
                >
                  Retry
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function getStatusLabel(state: RemoteControlState): string {
  if (state.mobileConnected) return 'Mobile connected'
  switch (state.status) {
    case 'active': return 'Waiting for mobile'
    case 'creating': return 'Creating session...'
    case 'disconnected': return 'Disconnected'
    case 'expired': return 'Session expired'
    case 'error': return 'Error'
    default: return state.status
  }
}

function getStatusClass(state: RemoteControlState): string {
  if (state.mobileConnected) return styles.statusConnected
  switch (state.status) {
    case 'active': return styles.statusActive
    case 'creating': return styles.statusCreating
    case 'error': return styles.statusError
    default: return styles.statusDisconnected
  }
}
