import { useState, useRef, useCallback } from 'react'
import type { ModelId } from '@shared/types'
import styles from './InputBar.module.css'

export interface AttachedImage {
  id: string
  dataUrl: string
  name: string
}

interface InputBarProps {
  onSend: (input: string, images?: AttachedImage[]) => void
  disabled?: boolean
  model?: ModelId
  placeholder?: string
}

let imageIdCounter = 0

export function InputBar({
  onSend,
  disabled = false,
  model,
  placeholder = 'Send a message...'
}: InputBarProps) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<AttachedImage[]>([])
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if ((!trimmed && images.length === 0) || disabled) return
    onSend(trimmed, images.length > 0 ? images : undefined)
    setValue('')
    setImages([])
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }
  }, [value, images, disabled, onSend])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) return
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const addImagesFromFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) continue
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        setImages((prev) => [
          ...prev,
          { id: `img-${++imageIdCounter}`, dataUrl, name: file.name }
        ])
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      const imageItems: DataTransferItem[] = []
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          imageItems.push(items[i])
        }
      }

      if (imageItems.length === 0) return

      e.preventDefault()
      for (const item of imageItems) {
        const file = item.getAsFile()
        if (file) addImagesFromFiles([file])
      }
    },
    [addImagesFromFiles]
  )

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id))
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()

      // Check for image files first
      const files = Array.from(e.dataTransfer.files)
      const imageFiles = files.filter((f) => f.type.startsWith('image/'))
      if (imageFiles.length > 0) {
        addImagesFromFiles(imageFiles)
        // Also add non-image file paths
        const nonImagePaths = files
          .filter((f) => !f.type.startsWith('image/'))
          .map((f) => f.path)
          .filter(Boolean)
        if (nonImagePaths.length > 0) {
          const text = nonImagePaths.join(' ')
          setValue((prev) => {
            const prefix = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
            return prev + prefix + text
          })
        }
        return
      }

      // OS file drops (non-image)
      const osPaths = files.map((f) => f.path).filter(Boolean)
      if (osPaths.length > 0) {
        const text = osPaths.join(' ')
        setValue((prev) => {
          const prefix = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
          return prev + prefix + text
        })
        return
      }

      // Internal editor drag (text/plain with file path)
      const textData = e.dataTransfer.getData('text/plain')
      if (textData) {
        setValue((prev) => {
          const prefix = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
          return prev + prefix + textData
        })
      }
    },
    [addImagesFromFiles]
  )

  return (
    <div
      className={styles.bar}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDrop={handleDrop}
    >
      {images.length > 0 && (
        <div className={styles.imageStrip}>
          {images.map((img) => (
            <div key={img.id} className={styles.imageChip}>
              <img src={img.dataUrl} alt={img.name} className={styles.imageThumb} />
              <span className={styles.imageName}>{img.name || 'Pasted image'}</span>
              <button
                className={styles.imageRemove}
                onClick={() => removeImage(img.id)}
                title="Remove image"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={styles.inputWrapper}>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        <div className={styles.actions}>
          {model && <span className={styles.model}>{model}</span>}
          <button
            className={styles.sendBtn}
            onClick={handleSubmit}
            disabled={disabled || (!value.trim() && images.length === 0)}
            title="Send (Enter)"
          >
            <SendIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
    </svg>
  )
}
