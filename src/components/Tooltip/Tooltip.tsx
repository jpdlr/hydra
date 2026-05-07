import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

interface TooltipProps {
  content: ReactNode
  children: ReactElement
  placement?: 'top' | 'bottom'
  delay?: number
  disabled?: boolean
}

interface Position {
  left: number
  top: number
  placement: 'top' | 'bottom'
}

// Shared open-tooltip token so a fresh hover on one trigger snaps to a
// neighbour without waiting for the full delay (KeyClu/Linear-style).
let lastShownAt = 0
const FAST_FOLLOW_WINDOW = 600

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 250,
  disabled = false
}: TooltipProps) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Position | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const show = useCallback(() => {
    cancel()
    if (disabled || !content) return
    const fastFollow = Date.now() - lastShownAt < FAST_FOLLOW_WINDOW
    timerRef.current = setTimeout(
      () => {
        setOpen(true)
        lastShownAt = Date.now()
      },
      fastFollow ? 40 : delay
    )
  }, [cancel, content, delay, disabled])

  const hide = useCallback(() => {
    cancel()
    setOpen(false)
  }, [cancel])

  useEffect(() => () => cancel(), [cancel])

  const computePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tip = tooltipRef.current
    if (!trigger || !tip) return
    const tRect = trigger.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()
    const margin = 6

    let resolved: 'top' | 'bottom' = placement
    if (placement === 'top' && tRect.top - tipRect.height - margin < 0) {
      resolved = 'bottom'
    } else if (placement === 'bottom' && tRect.bottom + tipRect.height + margin > window.innerHeight) {
      resolved = 'top'
    }

    const top =
      resolved === 'top'
        ? tRect.top - tipRect.height - margin
        : tRect.bottom + margin

    let left = tRect.left + tRect.width / 2 - tipRect.width / 2
    left = Math.max(4, Math.min(window.innerWidth - tipRect.width - 4, left))

    setPos({ left, top, placement: resolved })
  }, [placement])

  useLayoutEffect(() => {
    if (!open) return
    computePosition()
    const handler = () => computePosition()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open, computePosition])

  if (!isValidElement(children)) return children

  const childProps = children.props as Record<string, unknown>

  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      const orig = (children as { ref?: unknown }).ref
      if (typeof orig === 'function') orig(node)
      else if (orig && typeof orig === 'object' && 'current' in orig) {
        ;(orig as { current: HTMLElement | null }).current = node
      }
    },
    onMouseEnter: (e: React.MouseEvent) => {
      ;(childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
      show()
    },
    onMouseLeave: (e: React.MouseEvent) => {
      ;(childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      ;(childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e)
      show()
    },
    onBlur: (e: React.FocusEvent) => {
      ;(childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e)
      hide()
    },
    onPointerDown: (e: React.PointerEvent) => {
      ;(childProps.onPointerDown as ((e: React.PointerEvent) => void) | undefined)?.(e)
      hide()
    },
    'aria-describedby': open ? id : undefined
  })

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={tooltipRef}
            id={id}
            role="tooltip"
            className={`${styles.tooltip} ${pos?.placement === 'bottom' ? styles.bottom : styles.top}`}
            style={
              pos
                ? { left: pos.left, top: pos.top }
                : { opacity: 0, pointerEvents: 'none', left: -9999, top: -9999 }
            }
          >
            {content}
          </div>,
          document.body
        )}
    </>
  )
}
