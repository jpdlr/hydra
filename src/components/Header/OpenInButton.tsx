import { useState, useRef, useEffect, useCallback } from 'react'
import type { EditorId } from '@shared/types'
import { EDITOR_REGISTRY } from '@shared/types'
import { EditorIcon } from '../shared/EditorIcon'
import styles from './OpenInButton.module.css'

interface OpenInButtonProps {
  projectDir: string | null
  defaultEditor: EditorId
  onSetDefaultEditor: (editorId: EditorId) => void
}

export function OpenInButton({ projectDir, defaultEditor, onSetDefaultEditor }: OpenInButtonProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleMainClick = useCallback(() => {
    if (!projectDir) return
    void window.hydra.openInApp(defaultEditor, projectDir)
  }, [projectDir, defaultEditor])

  const handleItemClick = useCallback((editorId: EditorId) => {
    if (!projectDir) return
    void window.hydra.openInApp(editorId, projectDir)
    onSetDefaultEditor(editorId)
    setOpen(false)
  }, [projectDir, onSetDefaultEditor])

  const defaultLabel = EDITOR_REGISTRY.find((e) => e.id === defaultEditor)?.label ?? 'Open'

  if (!projectDir) return null

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        className={styles.mainBtn}
        onClick={handleMainClick}
        title={`Open in ${defaultLabel}`}
      >
        <EditorIcon editor={defaultEditor} size={14} />
        <span className={styles.label}>Open</span>
      </button>
      <button
        className={`${styles.chevronBtn} ${open ? styles.chevronBtnOpen : ''}`}
        onClick={() => setOpen(!open)}
        title="Open in..."
      >
        <ChevronIcon />
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>Open in</div>
          {EDITOR_REGISTRY.map((editor) => (
            <button
              key={editor.id}
              className={`${styles.dropdownItem} ${editor.id === defaultEditor ? styles.dropdownItemDefault : ''}`}
              onClick={() => handleItemClick(editor.id)}
            >
              <EditorIcon editor={editor.id} size={14} />
              <span className={styles.editorLabel}>{editor.label}</span>
              {editor.id === defaultEditor && (
                <span className={styles.defaultBadge}>default</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
