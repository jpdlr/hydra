import { useState, useCallback, useRef, useEffect } from 'react'
import { FileTree } from './FileTree'
import { FileTreeFilterResults } from './FileTreeFilterResults'
import { TabBar } from './TabBar'
import { CodeEditor } from './CodeEditor'
import type { EditorTab } from './TabBar'
import type { FsSearchResult } from '@shared/types'
import styles from './EditorPanel.module.css'

import '../../lib/monacoSetup'

interface EditorPanelProps {
  agentId: string
  projectDir: string
  theme: string
  tabs: EditorTab[]
  activeTabPath: string | null
  fileContents: Map<string, string>
  onOpenFile: (path: string) => void
  onCloseTab: (path: string) => void
  onSelectTab: (path: string) => void
  onContentChange: (path: string, content: string) => void
  onSaveFile: (path: string) => void
}

const FILE_TREE_MIN = 140
const FILE_TREE_MAX = 400

export function EditorPanel({
  agentId,
  projectDir,
  theme,
  tabs,
  activeTabPath,
  fileContents,
  onOpenFile,
  onCloseTab,
  onSelectTab,
  onContentChange,
  onSaveFile
}: EditorPanelProps) {
  const [treeWidth, setTreeWidth] = useState(220)
  const [isDraggingTree, setIsDraggingTree] = useState(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const [filterQuery, setFilterQuery] = useState('')
  const [filterResults, setFilterResults] = useState<FsSearchResult[]>([])
  const [isFiltering, setIsFiltering] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!filterQuery.trim()) {
      setFilterResults([])
      setIsFiltering(false)
      return
    }

    setIsFiltering(true)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      window.hydra
        .searchFiles(agentId, filterQuery, 100)
        .then((results) => {
          setFilterResults(results)
          setIsFiltering(false)
        })
        .catch(() => {
          setFilterResults([])
          setIsFiltering(false)
        })
    }, 200)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [agentId, filterQuery])

  const handleTreeResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      startXRef.current = e.clientX
      startWidthRef.current = treeWidth
      setIsDraggingTree(true)

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onPointerMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startXRef.current
        const newWidth = Math.min(FILE_TREE_MAX, Math.max(FILE_TREE_MIN, startWidthRef.current + delta))
        setTreeWidth(newWidth)
      }

      const onPointerUp = () => {
        setIsDraggingTree(false)
        target.releasePointerCapture(e.pointerId)
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', onPointerUp)
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', onPointerUp)
    },
    [treeWidth]
  )

  const activeContent = activeTabPath ? fileContents.get(activeTabPath) ?? '' : ''

  const showFilterResults = filterQuery.trim().length > 0

  return (
    <div className={styles.panel}>
      <div className={styles.fileTreeSide} style={{ width: treeWidth }}>
        <div className={styles.fileTreeHeader}>
          <span className={styles.fileTreeTitle}>FILES</span>
        </div>
        <input
          className={styles.filterInput}
          type="text"
          placeholder="Filter files..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
        />
        {showFilterResults ? (
          <FileTreeFilterResults
            results={filterResults}
            activeFilePath={activeTabPath}
            onOpenFile={onOpenFile}
          />
        ) : (
          <FileTree
            agentId={agentId}
            rootPath={projectDir}
            activeFilePath={activeTabPath}
            onOpenFile={onOpenFile}
          />
        )}
        <div
          className={`${styles.treeResizeHandle} ${isDraggingTree ? styles.treeResizeActive : ''}`}
          onPointerDown={handleTreeResizeDown}
        />
      </div>

      <div className={styles.editorSide}>
        <TabBar
          tabs={tabs}
          activeTabPath={activeTabPath}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
        />
        <CodeEditor
          filePath={activeTabPath}
          content={activeContent}
          theme={theme}
          onChange={(value) => {
            if (activeTabPath) onContentChange(activeTabPath, value)
          }}
          onSave={() => {
            if (activeTabPath) onSaveFile(activeTabPath)
          }}
        />
      </div>
    </div>
  )
}
