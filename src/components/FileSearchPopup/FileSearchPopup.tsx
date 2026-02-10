import { useState, useEffect, useRef, useCallback } from 'react'
import type { FsSearchResult } from '@shared/types'
import { getFileIcon } from '../EditorPanel/fileIcons'
import styles from './FileSearchPopup.module.css'

interface FileSearchPopupProps {
  agentId: string
  onOpenFile: (path: string) => void
  onClose: () => void
}

export function FileSearchPopup({ agentId, onOpenFile, onClose }: FileSearchPopupProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FsSearchResult[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSelectedIndex(0)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      window.hydra
        .searchFiles(agentId, query, 50)
        .then((res) => {
          setResults(res)
          setSelectedIndex(0)
        })
        .catch(() => {
          setResults([])
        })
    }, 150)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [agentId, query])

  // Scroll selected item into view
  useEffect(() => {
    const container = resultsRef.current
    if (!container) return
    const selected = container.children[selectedIndex] as HTMLElement | undefined
    if (selected?.scrollIntoView) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleSelect = useCallback(
    (path: string) => {
      onOpenFile(path)
      onClose()
    },
    [onOpenFile, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (results[selectedIndex]) {
            handleSelect(results[selectedIndex].path)
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [results, selectedIndex, handleSelect, onClose]
  )

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div className={styles.popup} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className={styles.input}
          type="text"
          placeholder="Search files by name..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className={styles.results} ref={resultsRef}>
          {query.trim() && results.length === 0 && (
            <div className={styles.empty}>No files found</div>
          )}
          {results.map((result, i) => {
            const dir = result.path.slice(0, result.path.length - result.name.length)
            return (
              <button
                key={result.path}
                className={`${styles.resultItem} ${i === selectedIndex ? styles.resultItemSelected : ''}`}
                onMouseDown={() => handleSelect(result.path)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className={styles.resultIcon}>{getFileIcon(result)}</span>
                <span className={styles.resultName}>{result.name}</span>
                {dir && <span className={styles.resultPath}>{dir}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
