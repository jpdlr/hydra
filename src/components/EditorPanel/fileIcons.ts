import type { FsDirEntry } from '@shared/types'

export function getFileIcon(entry: FsDirEntry | { name: string; isDirectory: boolean }): string {
  if (entry.isDirectory) return '\u{1F4C1}'
  const ext = entry.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '\u{1F1F9}'
    case 'js':
    case 'jsx':
      return '\u{1F1EF}'
    case 'css':
    case 'scss':
      return '\u{1F3A8}'
    case 'json':
      return '\u{1F4CB}'
    case 'md':
    case 'mdx':
      return '\u{1F4DD}'
    case 'html':
      return '\u{1F310}'
    case 'svg':
      return '\u{1F5BC}'
    default:
      return '\u{1F4C4}'
  }
}
