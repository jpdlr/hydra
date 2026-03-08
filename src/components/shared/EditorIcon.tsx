import type { EditorId } from '@shared/types'

interface EditorIconProps {
  editor: EditorId
  size?: number
  className?: string
}

export function EditorIcon({ editor, size = 14, className }: EditorIconProps) {
  const props = { width: size, height: size, className, 'aria-hidden': true as const }

  switch (editor) {
    case 'vscode':
      return (
        <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.5 2.5L4 8l6.5 5.5" />
          <path d="M12 3v10" />
          <path d="M4 8L10.5 2.5" />
          <path d="M4 8l6.5 5.5" />
        </svg>
      )
    case 'cursor':
      return (
        <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 2l10 6-4 1.5L7.5 14z" />
          <path d="M9 9.5l3.5 3.5" />
        </svg>
      )
    case 'windsurf':
      return (
        <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12C4 7 7 4 14 3" />
          <path d="M2 9C4 5.5 7 3.5 12 3" />
          <path d="M2 6C4 4 6 3 9 3" />
        </svg>
      )
    case 'antigravity':
      return (
        <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 13V3" />
          <path d="M5 6l3-3 3 3" />
          <path d="M3 13h10" />
        </svg>
      )
    case 'zed':
      return (
        <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4h10L3 12h10" />
        </svg>
      )
    case 'finder':
      return (
        <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M2 6h12" />
          <circle cx="4" cy="4.5" r="0.5" fill="currentColor" stroke="none" />
          <circle cx="5.8" cy="4.5" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'terminal':
      return (
        <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M5 7l2 1.5L5 10" />
          <path d="M9 10h3" />
        </svg>
      )
  }
}
