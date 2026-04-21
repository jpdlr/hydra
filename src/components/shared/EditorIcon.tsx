import type { EditorId } from '@shared/types'
import vscodeIcon from '@/assets/icons/vscode.svg'
import cursorIcon from '@/assets/icons/cursor.svg'
import windsurfIcon from '@/assets/icons/windsurf.svg'
import antigravityIcon from '@/assets/icons/antigravity.svg'
import zedIcon from '@/assets/icons/zed.svg'
import finderIcon from '@/assets/icons/finder.svg'
import terminalIcon from '@/assets/icons/terminal.svg'

const EDITOR_ICONS: Record<EditorId, string> = {
  vscode: vscodeIcon,
  cursor: cursorIcon,
  windsurf: windsurfIcon,
  antigravity: antigravityIcon,
  zed: zedIcon,
  finder: finderIcon,
  terminal: terminalIcon
}

interface EditorIconProps {
  editor: EditorId
  size?: number
  className?: string
}

export function EditorIcon({ editor, size = 14, className }: EditorIconProps) {
  const src = EDITOR_ICONS[editor]
  if (!src) return null
  return (
    <img
      src={src}
      width={size}
      height={size}
      className={className}
      alt=""
      aria-hidden
      style={{ display: 'inline-block', objectFit: 'contain' }}
    />
  )
}
