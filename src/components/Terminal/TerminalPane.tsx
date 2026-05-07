import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { ImageAddon } from '@xterm/addon-image'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useTerminalConfig } from '../../hooks/useTerminalConfig'

interface TerminalPaneProps {
  rawOutput: string
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  className?: string
  fontSize?: number
  lineHeight?: number
  autoFocus?: boolean
  isVisible?: boolean
}

function getTerminalTheme(): Record<string, string> {
  const s = getComputedStyle(document.documentElement)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  const bg = v('--color-terminal-bg', '#262624')
  const fg = v('--color-terminal-text', '#E8E4E0')
  return {
    background: bg,
    foreground: fg,
    cursor: v('--color-terminal-cursor', '#D97757'),
    cursorAccent: bg,
    selectionBackground: v('--color-terminal-selection', 'rgba(217, 119, 87, 0.3)'),
    selectionForeground: fg,
    black: bg,
    red: '#E53935',
    green: '#66BB6A',
    yellow: '#FFA726',
    blue: '#42A5F5',
    magenta: '#AB47BC',
    cyan: '#26C6DA',
    white: fg,
    brightBlack: '#6B6760',
    brightRed: '#EF5350',
    brightGreen: '#81C784',
    brightYellow: '#FFB74D',
    brightBlue: '#64B5F6',
    brightMagenta: '#CE93D8',
    brightCyan: '#4DD0E1',
    brightWhite: '#FAF6F1'
  }
}

export function TerminalPane({
  rawOutput,
  onData,
  onResize,
  className,
  fontSize,
  lineHeight = 1.35,
  autoFocus = true,
  isVisible = true
}: TerminalPaneProps) {
  const terminalConfig = useTerminalConfig()
  const effectiveFontSize = fontSize ?? terminalConfig.fontSize
  const effectiveFontFamily = terminalConfig.fontFamily
  const effectiveCursorStyle = terminalConfig.cursorStyle
  const effectiveCursorBlink = terminalConfig.cursorBlink
  const effectiveEnableWebgl = terminalConfig.enableWebgl
  const wrapperRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const fitAndNotifyRef = useRef<(() => void) | null>(null)
  const onDataRef = useRef(onData)
  const onResizeRef = useRef(onResize)
  const writtenLengthRef = useRef(0)
  const targetOutputRef = useRef(rawOutput)
  const writeInFlightRef = useRef(false)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  const [isScrolledUp, setIsScrolledUp] = useState(false)

  useEffect(() => {
    onDataRef.current = onData
  }, [onData])

  useEffect(() => {
    onResizeRef.current = onResize
  }, [onResize])

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: effectiveFontFamily,
      fontSize: effectiveFontSize,
      lineHeight,
      cursorBlink: effectiveCursorBlink,
      cursorStyle: effectiveCursorStyle,
      disableStdin: !onData,
      scrollback: 5000,
      allowProposedApi: true,
      // Preserve raw terminal newline/cursor semantics for TUI apps like Codex.
      convertEol: false
    })

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    const imageAddon = new ImageAddon()
    const webLinksAddon = new WebLinksAddon((event, uri) => {
      event.preventDefault()
      window.hydra.openExternal(uri).catch(() => {})
    })
    const unicode11Addon = new Unicode11Addon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(imageAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.loadAddon(unicode11Addon)
    if (terminal.unicode) {
      terminal.unicode.activeVersion = '11'
    }
    terminal.open(containerRef.current)

    let webglAddon: WebglAddon | null = null
    if (effectiveEnableWebgl) {
      try {
        webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon?.dispose()
          webglAddon = null
        })
        terminal.loadAddon(webglAddon)
      } catch (err) {
        console.warn('[TerminalPane] WebGL renderer unavailable, falling back to canvas:', err)
        webglAddon = null
      }
    }

    const fitAndNotify = () => {
      try {
        fitAddon.fit()
      } catch {
        // Container may not be visible yet
        return
      }

      const cols = terminal.cols
      const rows = terminal.rows
      const lastSize = lastSizeRef.current
      if (!lastSize || lastSize.cols !== cols || lastSize.rows !== rows) {
        lastSizeRef.current = { cols, rows }
        onResizeRef.current?.(cols, rows)
      }
    }
    fitAndNotifyRef.current = fitAndNotify

    // Fit after a microtask to allow layout, then optionally focus.
    requestAnimationFrame(() => {
      fitAndNotify()
      if (autoFocus) {
        terminal.focus()
      }
    })
    const fitTimers = [80, 180].map((delay) => setTimeout(fitAndNotify, delay))

    // Shift+Enter → send newline instead of carriage return
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown' && e.key === 'Enter' && e.shiftKey) {
        onDataRef.current?.('\n')
        return false // prevent xterm from also sending \r
      }
      return true
    })

    if (onDataRef.current) {
      terminal.onData((data) => {
        onDataRef.current?.(data)
      })
    }

    // Track whether user has scrolled up from the bottom.
    // viewportY is the top line of the visible viewport;
    // baseY is the top line of the last (bottom) page.
    // When viewportY < baseY, the user has scrolled up.
    const checkScrollPosition = () => {
      const buf = terminal.buffer.active
      setIsScrolledUp(buf.viewportY < buf.baseY)
    }
    const scrollDisposable = terminal.onScroll(checkScrollPosition)

    terminalRef.current = terminal
    writtenLengthRef.current = 0
    writeInFlightRef.current = false

    // Handle resize
    const observer = new ResizeObserver(() => {
      fitAndNotify()
    })
    observer.observe(containerRef.current)

    // Re-apply terminal theme when data-theme attribute changes
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = getTerminalTheme()
    })
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })

    // ── Native DOM listeners for Shift+Enter (capture phase fallback) ──
    // xterm creates an internal textarea that receives key events.
    // Use capture phase on the wrapper to intercept before xterm does.
    const wrapper = wrapperRef.current!
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        onDataRef.current?.('\n')
        return
      }
      // Cmd/Ctrl+Backspace → clear input line (readline kill-line, Ctrl+U).
      // macOS sends nothing for Cmd+Backspace by default; emit ^U so the
      // shell wipes from cursor to start-of-line, matching native input fields.
      if (e.key === 'Backspace' && (e.metaKey || (e.ctrlKey && !e.shiftKey && !e.altKey)) && !e.altKey) {
        e.preventDefault()
        e.stopPropagation()
        onDataRef.current?.('\u0015')
        return
      }
      // Cmd+Left / Cmd+Right → start / end of line (readline ^A / ^E).
      if (e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        e.stopPropagation()
        onDataRef.current?.(e.key === 'ArrowLeft' ? '' : '')
        return
      }
      // Option+Left / Option+Right → previous / next word (ESC b / ESC f).
      if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        e.stopPropagation()
        onDataRef.current?.(e.key === 'ArrowLeft' ? 'b' : 'f')
        return
      }
      // Option+Backspace → delete previous word (readline ^W).
      if (e.key === 'Backspace' && e.altKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        e.stopPropagation()
        onDataRef.current?.('')
        return
      }
    }
    wrapper.addEventListener('keydown', handleKeyDown, true) // capture phase

    // ── Native DOM listeners for drag-and-drop ──
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current++
      if (e.dataTransfer?.types.includes('Files') || e.dataTransfer?.types.includes('text/plain')) {
        setIsDragOver(true)
      }
    }
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current--
      if (dragCounterRef.current <= 0) {
        dragCounterRef.current = 0
        setIsDragOver(false)
      }
    }
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounterRef.current = 0
      setIsDragOver(false)

      // OS file drops
      const files = Array.from(e.dataTransfer?.files ?? [])
      const paths = files.map((f) => f.path).filter(Boolean)
      if (paths.length > 0) {
        onDataRef.current?.(paths.join(' '))
        return
      }
      // Internal editor drag (text/plain with file path)
      const textData = e.dataTransfer?.getData('text/plain')
      if (textData) {
        onDataRef.current?.(textData)
      }
    }

    wrapper.addEventListener('dragenter', handleDragEnter, true)
    wrapper.addEventListener('dragleave', handleDragLeave, true)
    wrapper.addEventListener('dragover', handleDragOver, true)
    wrapper.addEventListener('drop', handleDrop, true)

    return () => {
      for (const timer of fitTimers) {
        clearTimeout(timer)
      }
      scrollDisposable.dispose()
      observer.disconnect()
      themeObserver.disconnect()
      wrapper.removeEventListener('keydown', handleKeyDown, true)
      wrapper.removeEventListener('dragenter', handleDragEnter, true)
      wrapper.removeEventListener('dragleave', handleDragLeave, true)
      wrapper.removeEventListener('dragover', handleDragOver, true)
      wrapper.removeEventListener('drop', handleDrop, true)
      webglAddon?.dispose()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      fitAndNotifyRef.current = null
    }
  }, [
    autoFocus,
    effectiveFontSize,
    effectiveFontFamily,
    effectiveCursorStyle,
    effectiveCursorBlink,
    effectiveEnableWebgl,
    lineHeight
  ])

  useEffect(() => {
    if (!isVisible) return
    requestAnimationFrame(() => {
      fitAndNotifyRef.current?.()
      if (autoFocus) {
        terminalRef.current?.focus()
      }
    })
  }, [autoFocus, isVisible])

  // Write new output incrementally
  useEffect(() => {
    targetOutputRef.current = rawOutput

    const flushPendingOutput = () => {
      const terminal = terminalRef.current
      if (!terminal || writeInFlightRef.current) return

      const targetOutput = targetOutputRef.current
      if (targetOutput.length < writtenLengthRef.current) {
        terminal.reset()
        writtenLengthRef.current = 0
      }

      if (targetOutput.length <= writtenLengthRef.current) return

      const newData = targetOutput.slice(writtenLengthRef.current)
      writeInFlightRef.current = true
      terminal.write(newData, () => {
        writtenLengthRef.current += newData.length
        writeInFlightRef.current = false

        // After xterm finishes writing, re-check scroll position.
        // New output may have pushed past viewport if user scrolled up.
        const buf = terminal.buffer.active
        setIsScrolledUp(buf.viewportY < buf.baseY)

        flushPendingOutput()
      })
    }

    flushPendingOutput()
  }, [rawOutput])

  return (
    <div
      ref={wrapperRef}
      className={className}
      onMouseDown={() => terminalRef.current?.focus()}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--color-terminal-bg)',
        borderRadius: 'inherit',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
      {isScrolledUp && (
        <button
          onClick={() => {
            terminalRef.current?.scrollToBottom()
            setIsScrolledUp(false)
          }}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 16,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--color-text-primary)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
            opacity: 0.92,
            transition: 'opacity 150ms'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.92' }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v10M4 9l4 4 4-4" />
          </svg>
          Bottom
        </button>
      )}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--color-accent-subtle)',
            border: '2px dashed var(--color-accent-hover)',
            borderRadius: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            pointerEvents: 'none'
          }}
        >
          <span
            style={{
              color: 'var(--color-accent)',
              fontSize: '13px',
              fontWeight: 500,
              background: 'var(--color-surface)',
              padding: '6px 14px',
              borderRadius: '6px'
            }}
          >
            Drop to insert file path
          </span>
        </div>
      )}
    </div>
  )
}
