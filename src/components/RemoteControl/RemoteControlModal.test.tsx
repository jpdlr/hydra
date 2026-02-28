// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteControlState } from '@shared/types'
import { RemoteControlModal } from './RemoteControlModal'

const { toCanvasMock } = vi.hoisted(() => ({
  toCanvasMock: vi.fn()
}))

vi.mock('qrcode', () => ({
  toCanvas: toCanvasMock
}))

const baseState: RemoteControlState = {
  enabled: true,
  status: 'active',
  sessionId: 'session-12345678',
  qrPayload: '{"sessionId":"session-12345678","mobileToken":"abc"}',
  connectedAt: null,
  expiresAt: new Date('2026-02-28T23:59:00.000Z').toISOString(),
  mobileConnected: false,
  error: null
}

function renderModal(state: RemoteControlState = baseState) {
  return render(
    <RemoteControlModal
      state={state}
      loading={false}
      onEnable={() => undefined}
      onDisable={() => undefined}
      onClose={() => undefined}
    />
  )
}

describe('RemoteControlModal', () => {
  beforeEach(() => {
    toCanvasMock.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a loading indicator while generating QR canvas', async () => {
    let resolveRender: (() => void) | null = null
    const pending = new Promise<void>((resolve) => {
      resolveRender = resolve
    })
    toCanvasMock.mockReturnValueOnce(pending)

    renderModal()

    await waitFor(() => {
      expect(toCanvasMock).toHaveBeenCalledWith(
        expect.any(HTMLCanvasElement),
        baseState.qrPayload,
        expect.objectContaining({ width: 200, margin: 1 })
      )
    })

    expect(screen.getByText('Generating QR code...')).toBeTruthy()

    resolveRender?.()

    await waitFor(() => {
        expect(screen.queryByText('Generating QR code...')).toBeNull()
      })
  })

  it('shows fallback details when QR render fails', async () => {
    toCanvasMock.mockRejectedValueOnce(new Error('render failed'))

    renderModal()

    await waitFor(() => {
      expect(
        screen.getByText('Could not render QR image. Retry or copy session payload below.')
      ).toBeTruthy()
    })

    const fallbackPayload = screen.getByRole('textbox', { name: 'Remote session payload fallback' })
    expect(fallbackPayload).toBeTruthy()
    expect((fallbackPayload as HTMLTextAreaElement).value).toBe(baseState.qrPayload)
    expect(screen.getByRole('button', { name: 'Regenerate QR' })).toBeTruthy()
  })
})
