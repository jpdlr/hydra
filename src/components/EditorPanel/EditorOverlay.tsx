import { useCallback, useRef, useState } from 'react'
import { EditorPanel } from './index'
import type { EditorTab } from './TabBar'
import styles from './EditorOverlay.module.css'

interface EditorOverlayProps {
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
  onClose: () => void
}

const MIN_WIDTH = 360

const getMaxWidth = () => (typeof window !== 'undefined' ? window.innerWidth : 4000)
const getDefaultWidth = () =>
  Math.max(MIN_WIDTH, Math.round((typeof window !== 'undefined' ? window.innerWidth : 1600) * 0.5))

export function EditorOverlay(props: EditorOverlayProps) {
  // Always open at 50% of the app width; user can resize within the session.
  const [width, setWidth] = useState<number>(() => getDefaultWidth())
  const [isResizing, setIsResizing] = useState(false)
  const startRef = useRef({ x: 0, w: 0 })

  const handleResizeDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      startRef.current = { x: e.clientX, w: width }
      setIsResizing(true)
      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onMove = (ev: PointerEvent) => {
        const delta = startRef.current.x - ev.clientX
        const next = Math.min(getMaxWidth(), Math.max(MIN_WIDTH, startRef.current.w + delta))
        setWidth(next)
      }
      const onUp = () => {
        setIsResizing(false)
        target.releasePointerCapture(e.pointerId)
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
      }
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
    },
    [width]
  )

  return (
    <div className={styles.wrap}>
      <div
        className={`${styles.panel} ${isResizing ? '' : styles.panelTransition}`}
        style={{ width }}
      >
        <div
          className={`${styles.resize} ${isResizing ? styles.resizeActive : ''}`}
          onPointerDown={handleResizeDown}
          title="Drag to resize"
        />
        <button className={styles.close} onClick={props.onClose} title="Close editor">
          ✕
        </button>
        <EditorPanel
          agentId={props.agentId}
          projectDir={props.projectDir}
          theme={props.theme}
          tabs={props.tabs}
          activeTabPath={props.activeTabPath}
          fileContents={props.fileContents}
          onOpenFile={props.onOpenFile}
          onCloseTab={props.onCloseTab}
          onSelectTab={props.onSelectTab}
          onContentChange={props.onContentChange}
          onSaveFile={props.onSaveFile}
        />
      </div>
    </div>
  )
}
