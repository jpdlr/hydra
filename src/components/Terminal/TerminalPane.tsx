import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  rawOutput: string
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  className?: string
  fontSize?: number
  lineHeight?: number
}

const TERMINAL_THEME = {
  background: '#1E1B18',
  foreground: '#E8E0D8',
  cursor: '#D97757',
  cursorAccent: '#1E1B18',
  selectionBackground: 'rgba(217, 119, 87, 0.3)',
  selectionForeground: '#E8E0D8',
  black: '#1E1B18',
  red: '#E53935',
  green: '#66BB6A',
  yellow: '#FFA726',
  blue: '#42A5F5',
  magenta: '#AB47BC',
  cyan: '#26C6DA',
  white: '#E8E0D8',
  brightBlack: '#6B6058',
  brightRed: '#EF5350',
  brightGreen: '#81C784',
  brightYellow: '#FFB74D',
  brightBlue: '#64B5F6',
  brightMagenta: '#CE93D8',
  brightCyan: '#4DD0E1',
  brightWhite: '#FAF6F1'
}

export function TerminalPane({
  rawOutput,
  onData,
  onResize,
  className,
  fontSize = 12,
  lineHeight = 1.35
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const onDataRef = useRef(onData)
  const onResizeRef = useRef(onResize)
  const writtenLengthRef = useRef(0)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)

  useEffect(() => {
    onDataRef.current = onData
  }, [onData])

  useEffect(() => {
    onResizeRef.current = onResize
  }, [onResize])

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      theme: TERMINAL_THEME,
      fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
      fontSize,
      lineHeight,
      cursorBlink: false,
      cursorStyle: 'bar',
      disableStdin: !onData,
      scrollback: 5000,
      convertEol: true
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(webLinksAddon)
    terminal.open(containerRef.current)

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

    // Fit after a microtask to allow layout
    requestAnimationFrame(() => {
      fitAndNotify()
    })
    const fitTimers = [80, 180].map((delay) => setTimeout(fitAndNotify, delay))

    if (onDataRef.current) {
      terminal.onData((data) => {
        onDataRef.current?.(data)
      })
    }

    terminalRef.current = terminal
    writtenLengthRef.current = 0

    // Handle resize
    const observer = new ResizeObserver(() => {
      fitAndNotify()
    })
    observer.observe(containerRef.current)

    return () => {
      for (const timer of fitTimers) {
        clearTimeout(timer)
      }
      observer.disconnect()
      terminal.dispose()
      terminalRef.current = null
    }
  }, [fontSize, lineHeight])

  // Write new output incrementally
  useEffect(() => {
    if (!terminalRef.current) return

    // When agent output is reset (restart/switch), clear terminal and replay.
    if (rawOutput.length < writtenLengthRef.current) {
      terminalRef.current.reset()
      writtenLengthRef.current = 0
    }

    if (rawOutput.length > writtenLengthRef.current) {
      const newData = rawOutput.slice(writtenLengthRef.current)
      terminalRef.current.write(newData)
      writtenLengthRef.current = rawOutput.length
    }
  }, [rawOutput])

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseDown={() => terminalRef.current?.focus()}
      style={{
        width: '100%',
        height: '100%',
        background: '#1E1B18',
        borderRadius: 'inherit',
        overflow: 'hidden'
      }}
    />
  )
}
