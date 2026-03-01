import { useState, useCallback, useEffect, useRef } from 'react'
import type { EditorTab } from '../components/EditorPanel/TabBar'

export interface UseEditorPanelReturn {
  isOpen: boolean
  toggle: () => void
  tabs: EditorTab[]
  activeTabPath: string | null
  fileContents: Map<string, string>
  openFile: (path: string) => void
  closeTab: (path: string) => void
  selectTab: (path: string) => void
  updateContent: (path: string, content: string) => void
  saveFile: (path: string) => void
}

export function useEditorPanel(
  agentId: string | null,
  _projectDir: string | undefined
): UseEditorPanelReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map())
  const originalContents = useRef<Map<string, string>>(new Map())
  const prevAgentIdRef = useRef<string | null>(null)

  // Reset when agent changes
  useEffect(() => {
    if (agentId !== prevAgentIdRef.current) {
      prevAgentIdRef.current = agentId
      setTabs([])
      setActiveTabPath(null)
      setFileContents(new Map())
      originalContents.current = new Map()
    }
  }, [agentId])

  // Watch/unwatch filesystem when editor opens/closes
  useEffect(() => {
    if (!agentId || !isOpen) return
    window.hydra.watchDir(agentId)
    return () => {
      window.hydra.unwatchDir(agentId)
    }
  }, [agentId, isOpen])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  const openFile = useCallback(
    async (path: string) => {
      if (!agentId) return

      // If tab already exists, just activate it
      const existingTab = tabs.find((t) => t.path === path)
      if (existingTab) {
        setActiveTabPath(path)
        return
      }

      try {
        const result = await window.hydra.readFile(agentId, path)
        setFileContents((prev) => {
          const next = new Map(prev)
          next.set(path, result.content)
          return next
        })
        originalContents.current.set(path, result.content)
        setTabs((prev) => [...prev, { path, dirty: false }])
        setActiveTabPath(path)
      } catch (err) {
        console.error('Failed to open file:', err)
      }
    },
    [agentId, tabs]
  )

  const closeTab = useCallback(
    (path: string) => {
      setTabs((prev) => {
        const next = prev.filter((t) => t.path !== path)
        // If closing the active tab, switch to the next available tab
        if (activeTabPath === path) {
          const closedIndex = prev.findIndex((t) => t.path === path)
          const nextActive = next[Math.min(closedIndex, next.length - 1)]?.path ?? null
          setActiveTabPath(nextActive)
        }
        return next
      })
      setFileContents((prev) => {
        const next = new Map(prev)
        next.delete(path)
        return next
      })
      originalContents.current.delete(path)
    },
    [activeTabPath]
  )

  const selectTab = useCallback((path: string) => {
    setActiveTabPath(path)
  }, [])

  const updateContent = useCallback((path: string, content: string) => {
    setFileContents((prev) => {
      const next = new Map(prev)
      next.set(path, content)
      return next
    })
    // Mark tab as dirty if content differs from original
    const original = originalContents.current.get(path)
    const isDirty = content !== original
    setTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, dirty: isDirty } : t))
    )
  }, [])

  const saveFile = useCallback(
    async (path: string) => {
      if (!agentId) return
      const content = fileContents.get(path)
      if (content === undefined) return

      try {
        await window.hydra.writeFile(agentId, path, content)
        originalContents.current.set(path, content)
        setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, dirty: false } : t)))
      } catch (err) {
        console.error('Failed to save file:', err)
      }
    },
    [agentId, fileContents]
  )

  return {
    isOpen,
    toggle,
    tabs,
    activeTabPath,
    fileContents,
    openFile,
    closeTab,
    selectTab,
    updateContent,
    saveFile
  }
}
