import { createContext, useContext } from 'react'
import type { AppConfig, TerminalCursorStyle } from '@shared/types'
import { DEFAULT_CONFIG } from '@shared/types'

export interface TerminalVisualConfig {
  fontFamily: string
  fontSize: number
  cursorStyle: TerminalCursorStyle
  cursorBlink: boolean
  enableWebgl: boolean
}

const DEFAULT_TERMINAL_CONFIG: TerminalVisualConfig = {
  fontFamily: DEFAULT_CONFIG.terminalFontFamily,
  fontSize: DEFAULT_CONFIG.terminalFontSize,
  cursorStyle: DEFAULT_CONFIG.terminalCursorStyle,
  cursorBlink: DEFAULT_CONFIG.terminalCursorBlink,
  enableWebgl: DEFAULT_CONFIG.terminalEnableWebgl
}

export const TerminalConfigContext = createContext<TerminalVisualConfig>(DEFAULT_TERMINAL_CONFIG)

export function useTerminalConfig(): TerminalVisualConfig {
  return useContext(TerminalConfigContext)
}

export function deriveTerminalConfig(config: AppConfig): TerminalVisualConfig {
  return {
    fontFamily: config.terminalFontFamily || DEFAULT_TERMINAL_CONFIG.fontFamily,
    fontSize: config.terminalFontSize || DEFAULT_TERMINAL_CONFIG.fontSize,
    cursorStyle: config.terminalCursorStyle || DEFAULT_TERMINAL_CONFIG.cursorStyle,
    cursorBlink: config.terminalCursorBlink,
    enableWebgl: config.terminalEnableWebgl
  }
}
