import { useState, useCallback, useRef } from 'react'
import styles from './SplitHandle.module.css'

interface SplitHandleProps {
  onDrag: (deltaX: number) => void
  onDoubleClick: () => void
}

export function SplitHandle({ onDrag, onDoubleClick }: SplitHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      startXRef.current = e.clientX
      setIsDragging(true)

      const target = e.currentTarget as HTMLElement
      target.setPointerCapture(e.pointerId)

      const onPointerMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startXRef.current
        startXRef.current = ev.clientX
        onDrag(delta)
      }

      const onPointerUp = () => {
        setIsDragging(false)
        target.releasePointerCapture(e.pointerId)
        target.removeEventListener('pointermove', onPointerMove)
        target.removeEventListener('pointerup', onPointerUp)
      }

      target.addEventListener('pointermove', onPointerMove)
      target.addEventListener('pointerup', onPointerUp)
    },
    [onDrag]
  )

  return (
    <div
      className={`${styles.handle} ${isDragging ? styles.handleActive : ''}`}
      onPointerDown={handlePointerDown}
      onDoubleClick={onDoubleClick}
    />
  )
}
