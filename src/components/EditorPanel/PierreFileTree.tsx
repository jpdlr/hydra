import { useEffect, useMemo, useRef, useState } from 'react'
import { FileTree, useFileTree } from '@pierre/trees/react'
import styles from './PierreFileTree.module.css'

interface PierreFileTreeProps {
  agentId: string
  rootPath: string
  activeFilePath: string | null
  onOpenFile: (path: string) => void
}

const MAX_PATHS = 5000
const MAX_DEPTH = 10

async function walkProject(
  agentId: string,
  signal: { cancelled: boolean }
): Promise<string[]> {
  const out: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: '.', depth: 0 }]

  while (queue.length > 0 && out.length < MAX_PATHS) {
    if (signal.cancelled) return out
    const { dir, depth } = queue.shift()!
    let entries: { name: string; isDirectory: boolean }[]
    try {
      entries = await window.hydra.readDir(agentId, dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (out.length >= MAX_PATHS) break
      const path = dir === '.' ? entry.name : `${dir}/${entry.name}`
      out.push(path)
      if (entry.isDirectory && depth < MAX_DEPTH) {
        queue.push({ dir: path, depth: depth + 1 })
      }
    }
  }
  return out
}

export function PierreFileTree({
  agentId,
  rootPath,
  activeFilePath,
  onOpenFile
}: PierreFileTreeProps) {
  const [paths, setPaths] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const onOpenFileRef = useRef(onOpenFile)
  onOpenFileRef.current = onOpenFile

  useEffect(() => {
    const signal = { cancelled: false }
    setLoading(true)
    walkProject(agentId, signal).then((p) => {
      if (!signal.cancelled) {
        setPaths(p)
        setLoading(false)
      }
    })
    return () => {
      signal.cancelled = true
    }
  }, [agentId, rootPath])

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null
    const unsub = window.hydra.onFsWatchEvent((payload) => {
      if (payload.agentId !== agentId) return
      if (pending) clearTimeout(pending)
      pending = setTimeout(() => {
        const signal = { cancelled: false }
        walkProject(agentId, signal).then((p) => setPaths(p))
      }, 200)
    })
    return () => {
      if (pending) clearTimeout(pending)
      unsub()
    }
  }, [agentId])

  const initialSelectedPaths = useMemo(
    () => (activeFilePath ? [activeFilePath] : []),
    // intentionally only seed on mount; later updates go through resetPaths/focusPath
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  const { model } = useFileTree({
    paths,
    initialSelectedPaths,
    search: true,
    onSelectionChange: (selected) => {
      const last = selected[selected.length - 1]
      if (!last) return
      const item = model.getItem(last)
      if (item && !item.isDirectory()) {
        onOpenFileRef.current(last)
      }
    }
  })

  // Keep tree paths in sync with our state without recreating the model.
  useEffect(() => {
    model.resetPaths(paths)
  }, [model, paths])

  // Reflect external file selection (from tabs, search results, etc.) in the tree focus.
  useEffect(() => {
    if (activeFilePath) model.focusPath(activeFilePath)
  }, [model, activeFilePath])

  if (loading) {
    return <div className={styles.empty}>Loading…</div>
  }

  if (paths.length === 0) {
    return <div className={styles.empty}>No files found</div>
  }

  return <FileTree model={model} className={styles.tree} />
}
