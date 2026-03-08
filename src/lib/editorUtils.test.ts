import { describe, expect, it } from 'vitest'
import { fallbackOpenInEditors, getEditorLabel, normalizeInstalledEditors } from './editorUtils'

describe('editorUtils', () => {
  it('uses OS-specific file manager labels', () => {
    expect(getEditorLabel('finder', 'darwin')).toBe('Finder')
    expect(getEditorLabel('finder', 'win32')).toBe('Explorer')
    expect(getEditorLabel('finder', 'linux')).toBe('File Manager')
  })

  it('provides non-empty fallback entries', () => {
    expect(fallbackOpenInEditors('vscode', 'darwin')).toEqual(['vscode', 'finder', 'terminal'])
    expect(fallbackOpenInEditors('vscode', 'win32')).toEqual(['vscode', 'finder'])
  })

  it('normalizes empty detection to fallback entries', () => {
    expect(normalizeInstalledEditors([], 'vscode', 'darwin')).toEqual(['vscode', 'finder', 'terminal'])
    expect(normalizeInstalledEditors([], 'vscode', 'win32')).toEqual(['vscode', 'finder'])
  })

  it('keeps detected editors and guarantees default + file manager', () => {
    expect(normalizeInstalledEditors(['cursor'], 'vscode', 'darwin')).toEqual(['vscode', 'cursor', 'finder'])
  })
})

