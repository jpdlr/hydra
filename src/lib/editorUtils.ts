import { EDITOR_REGISTRY } from '@shared/types'
import type { EditorId } from '@shared/types'

type UiPlatform = 'darwin' | 'win32' | 'linux'

const KNOWN_EDITOR_IDS = new Set<EditorId>(EDITOR_REGISTRY.map((editor) => editor.id))

function detectUiPlatform(): UiPlatform {
  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  const rawPlatform = (
    navigatorWithUserAgentData.userAgentData?.platform
      ?? navigator.platform
      ?? navigator.userAgent
      ?? ''
  ).toLowerCase()

  if (rawPlatform.includes('win')) return 'win32'
  if (rawPlatform.includes('mac')) return 'darwin'
  return 'linux'
}

function uniq(ids: EditorId[]): EditorId[] {
  return Array.from(new Set(ids))
}

export function getEditorLabel(editorId: EditorId, platform: UiPlatform = detectUiPlatform()): string {
  if (editorId === 'finder') {
    if (platform === 'win32') return 'Explorer'
    if (platform === 'darwin') return 'Finder'
    return 'File Manager'
  }

  return EDITOR_REGISTRY.find((editor) => editor.id === editorId)?.label ?? 'Editor'
}

export function fallbackOpenInEditors(
  defaultEditor: EditorId,
  platform: UiPlatform = detectUiPlatform()
): EditorId[] {
  const fallback: EditorId[] = [defaultEditor, 'finder']
  if (platform === 'darwin') fallback.push('terminal')
  return uniq(fallback)
}

export function normalizeInstalledEditors(
  detectedEditors: EditorId[] | null | undefined,
  defaultEditor: EditorId,
  platform: UiPlatform = detectUiPlatform()
): EditorId[] {
  const filtered = (detectedEditors ?? []).filter(
    (editorId): editorId is EditorId => KNOWN_EDITOR_IDS.has(editorId)
  )

  if (filtered.length === 0) {
    return fallbackOpenInEditors(defaultEditor, platform)
  }

  return uniq([defaultEditor, ...filtered, 'finder'])
}
