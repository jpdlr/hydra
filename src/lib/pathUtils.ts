export function basename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}

export function dirname(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  parts.pop()
  return parts.join('/') || '/'
}
