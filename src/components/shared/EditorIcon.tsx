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
        <svg {...props} viewBox="0 0 100 100">
          <mask id="vsc-m">
            <rect width="100" height="100" fill="#fff" />
          </mask>
          <path d="M71.1 1.1L29.5 38.2 12.2 25.5l-8.6 4.3v40.4l8.6 4.3 17.3-12.7L71.1 99l25.3-10V11.1L71.1 1.1zM71.1 71L40.3 50l30.8-21v42zM12.2 35.5L25 50 12.2 64.5V35.5z" fill="#0078D4" />
        </svg>
      )
    case 'cursor':
      return (
        <svg {...props} viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#000" />
          <path d="M30 20L75 50 30 80z" fill="none" stroke="#fff" strokeWidth="6" strokeLinejoin="round" />
          <line x1="55" y1="60" x2="72" y2="78" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
        </svg>
      )
    case 'windsurf':
      return (
        <svg {...props} viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#0D9373" />
          <path d="M15 72C30 42 50 25 85 18" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M15 55C30 32 50 20 75 18" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.7" />
          <path d="M15 38C28 25 42 18 60 18" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" opacity="0.4" />
        </svg>
      )
    case 'antigravity':
      return (
        <svg {...props} viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#6C5CE7" />
          <path d="M50 75V25" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
          <path d="M35 40L50 25 65 40" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="25" y1="75" x2="75" y2="75" stroke="#fff" strokeWidth="7" strokeLinecap="round" />
        </svg>
      )
    case 'zed':
      return (
        <svg {...props} viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#084CCF" />
          <path d="M25 30h50L25 70h50" stroke="#fff" strokeWidth="8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'finder':
      return (
        <svg {...props} viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#4A9EF7" />
          <ellipse cx="50" cy="55" rx="28" ry="30" fill="#fff" />
          <ellipse cx="40" cy="48" rx="4" ry="6" fill="#333" />
          <ellipse cx="60" cy="48" rx="4" ry="6" fill="#333" />
          <path d="M35 65Q50 75 65 65" stroke="#333" strokeWidth="3" fill="none" strokeLinecap="round" />
          <line x1="50" y1="35" x2="50" y2="58" stroke="#333" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'terminal':
      return (
        <svg {...props} viewBox="0 0 100 100">
          <rect width="100" height="100" rx="20" fill="#2D2D2D" />
          <path d="M25 35L45 50 25 65" stroke="#4AF626" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <line x1="50" y1="65" x2="75" y2="65" stroke="#4AF626" strokeWidth="7" strokeLinecap="round" />
        </svg>
      )
  }
}
