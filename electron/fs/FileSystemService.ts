import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { watch, type FSWatcher } from 'fs'
import { join, resolve, relative, basename } from 'path'

import type { FsDirEntry, FsReadFileResult, FsSearchResult, FsWatchEventPayload } from '@shared/types'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'out',
  '.cache',
  '.turbo',
  '.vercel',
  '.svelte-kit',
  '__pycache__',
  '.DS_Store',
  'Thumbs.db',
  'coverage',
  '.nyc_output',
  '.parcel-cache'
])

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif',
  '.mp3', '.mp4', '.wav', '.ogg', '.webm', '.avi', '.mov',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.exe', '.dll', '.so', '.dylib',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.sqlite', '.db'
])

function assertWithinProject(filePath: string, projectDir: string): void {
  const resolved = resolve(filePath)
  const resolvedProject = resolve(projectDir)
  const rel = relative(resolvedProject, resolved)
  if (rel.startsWith('..') || resolve(resolvedProject, rel) !== resolved) {
    throw new Error('Path traversal denied')
  }
}

function isBinaryFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot === -1) return false
  return BINARY_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

export class FileSystemService {
  private watchers = new Map<string, FSWatcher>()

  async readDir(dirPath: string, projectDir: string): Promise<FsDirEntry[]> {
    const fullPath = resolve(projectDir, dirPath)
    assertWithinProject(fullPath, projectDir)

    const names = await readdir(fullPath)
    const result: FsDirEntry[] = []

    for (const name of names) {
      if (IGNORED_NAMES.has(name)) continue
      if (name.startsWith('.') && name !== '.env.example') continue
      const info = await stat(join(fullPath, name)).catch(() => null)
      if (!info) continue
      if (info.isFile() || info.isDirectory()) {
        result.push({ name, isDirectory: info.isDirectory() })
      }
    }

    result.sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return result
  }

  async readFile(filePath: string, projectDir: string): Promise<FsReadFileResult> {
    const fullPath = resolve(projectDir, filePath)
    assertWithinProject(fullPath, projectDir)

    if (isBinaryFile(basename(fullPath))) {
      throw new Error('Cannot open binary files')
    }

    const stats = await stat(fullPath)
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File too large (${(stats.size / 1024 / 1024).toFixed(1)} MB, max 5 MB)`)
    }

    const content = await readFile(fullPath, 'utf-8')
    return { content, path: filePath }
  }

  async writeFile(filePath: string, content: string, projectDir: string): Promise<void> {
    const fullPath = resolve(projectDir, filePath)
    assertWithinProject(fullPath, projectDir)
    await writeFile(fullPath, content, 'utf-8')
  }

  async searchFiles(
    query: string,
    projectDir: string,
    maxResults = 100
  ): Promise<FsSearchResult[]> {
    if (!query.trim()) return []
    const lowerQuery = query.toLowerCase()
    const results: FsSearchResult[] = []

    const walk = async (dir: string): Promise<void> => {
      if (results.length >= maxResults) return
      let names: string[]
      try {
        names = await readdir(dir)
      } catch {
        return
      }
      for (const name of names) {
        if (results.length >= maxResults) return
        if (IGNORED_NAMES.has(name)) continue
        if (name.startsWith('.')) continue
        const fullPath = join(dir, name)
        const relPath = relative(projectDir, fullPath).replaceAll('\\', '/')
        const info = await stat(fullPath).catch(() => null)
        if (!info) continue
        if (info.isDirectory()) {
          await walk(fullPath)
        } else if (!isBinaryFile(name)) {
          if (relPath.toLowerCase().includes(lowerQuery)) {
            results.push({ path: relPath, name, isDirectory: false })
          }
        }
      }
    }

    await walk(projectDir)
    return results
  }

  startWatch(
    agentId: string,
    projectDir: string,
    onEvent: (payload: FsWatchEventPayload) => void
  ): void {
    this.stopWatch(agentId)

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const watcher = watch(projectDir, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      // Ignore changes in filtered directories
      const parts = filename.split('/')
      if (parts.some((p) => IGNORED_NAMES.has(p))) return

      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        onEvent({
          agentId,
          eventType: eventType === 'rename' ? 'rename' : 'change',
          path: filename
        })
      }, 300)
    })

    this.watchers.set(agentId, watcher)
  }

  stopWatch(agentId: string): void {
    const existing = this.watchers.get(agentId)
    if (existing) {
      existing.close()
      this.watchers.delete(agentId)
    }
  }

  stopAll(): void {
    for (const [id] of this.watchers) {
      this.stopWatch(id)
    }
  }
}
