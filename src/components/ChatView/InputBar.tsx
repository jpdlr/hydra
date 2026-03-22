import { useState, useRef, useCallback, useEffect } from 'react'
import type { ModelId, ProviderId, GitBranch, WorkMode } from '@shared/types'
import claudeIcon from '@/assets/claude-icon.png'
import codexIcon from '@/assets/codex-icon.png'
import { useRuntimeProviderModels } from '../../hooks/useRuntimeProviderModels'
import styles from './InputBar.module.css'

export interface AttachedImage {
  id: string
  dataUrl: string
  name: string
}

interface InputBarProps {
  onSend: (input: string, images?: AttachedImage[]) => void
  onModelChange?: (model: ModelId) => void
  disabled?: boolean
  provider?: ProviderId
  model?: ModelId
  gitBranch?: string | null
  projectDir?: string
  onBranchChanged?: (branch: string) => void
  placeholder?: string
  workMode?: WorkMode
  worktreeBranch?: string | null
}

let imageIdCounter = 0

export function InputBar({
  onSend,
  onModelChange,
  disabled = false,
  provider,
  model,
  gitBranch,
  projectDir,
  onBranchChanged,
  placeholder = 'Send a message...',
  workMode = 'local',
  worktreeBranch
}: InputBarProps) {
  const [value, setValue] = useState('')
  const [images, setImages] = useState<AttachedImage[]>([])
  const [previewImage, setPreviewImage] = useState<AttachedImage | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const { providerModels, getModelOption } = useRuntimeProviderModels()

  // Branch picker state
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const modelPickerRef = useRef<HTMLDivElement>(null)
  const [branchPickerOpen, setBranchPickerOpen] = useState(false)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [branchFilter, setBranchFilter] = useState('')
  const [branchLoading, setBranchLoading] = useState(false)
  const branchPickerRef = useRef<HTMLDivElement>(null)
  const branchFilterRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!previewImage) return
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewImage(null)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [previewImage])

  // Close branch picker on outside click
  useEffect(() => {
    if (!branchPickerOpen) return
    const handleClick = (e: MouseEvent) => {
      if (branchPickerRef.current && !branchPickerRef.current.contains(e.target as Node)) {
        setBranchPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [branchPickerOpen])

  useEffect(() => {
    if (!modelPickerOpen) return
    const handleClick = (e: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [modelPickerOpen])

  const openBranchPicker = useCallback(async () => {
    if (!projectDir) return
    if (branchPickerOpen) {
      setBranchPickerOpen(false)
      return
    }
    setBranchLoading(true)
    setBranchPickerOpen(true)
    setBranchFilter('')
    try {
      const list = await window.hydra.gitListBranches(projectDir)
      setBranches(list)
    } catch {
      setBranches([])
    } finally {
      setBranchLoading(false)
      requestAnimationFrame(() => branchFilterRef.current?.focus())
    }
  }, [projectDir, branchPickerOpen])

  const handleCheckout = useCallback(async (branchName: string) => {
    if (!projectDir) return
    setBranchPickerOpen(false)
    try {
      await window.hydra.gitCheckout(projectDir, branchName)
      onBranchChanged?.(branchName)
    } catch {
      // checkout failed — could have uncommitted changes
    }
  }, [projectDir, onBranchChanged])

  const handleModelSelect = useCallback((nextModel: ModelId) => {
    setModelPickerOpen(false)
    if (!nextModel || !onModelChange || nextModel === model) return
    onModelChange(nextModel)
  }, [model, onModelChange])

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
      {previewImage && (
        <div className={styles.lightbox} onClick={() => setPreviewImage(null)}>
          <img
            src={previewImage.dataUrl}
            alt={previewImage.name}
            className={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
          <button className={styles.lightboxClose} onClick={() => setPreviewImage(null)}>
            ✕
          </button>
        </div>
      )}
      <div className={styles.inputCard}>
        {images.length > 0 && (
          <div className={styles.imageStrip}>
            {images.map((img) => (
              <div key={img.id} className={styles.imageChip}>
                <img
                  src={img.dataUrl}
                  alt={img.name}
                  className={styles.imageThumb}
                  onClick={() => setPreviewImage(img)}
                />
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
        <div className={styles.toolbar}>
          {model && (
            <div className={styles.modelPickerAnchor} ref={modelPickerRef}>
              <button
                type="button"
                className={`${styles.modelPill} ${onModelChange && provider ? styles.modelPillClickable : ''}`}
                onClick={() => {
                  if (!onModelChange || !provider || !model) return
                  if (provider === 'codex') {
                    onModelChange(model)
                    return
                  }
                  setModelPickerOpen((open) => !open)
                }}
                title={
                  !onModelChange || !provider
                    ? undefined
                    : provider === 'codex'
                      ? 'Open Codex model picker'
                      : 'Switch model'
                }
              >
                <ProviderIcon provider={provider} />
                {formatModelLabel(provider, getModelOption(provider ?? 'claude', model)?.label ?? model)}
                {onModelChange && provider === 'claude' && <ChevronIcon open={modelPickerOpen} />}
                {onModelChange && provider === 'codex' && <OpenChevronIcon />}
              </button>
              {modelPickerOpen && provider === 'claude' && (
                <ModelPickerDropdown
                  models={providerModels[provider]}
                  currentModel={model}
                  provider={provider}
                  onSelect={handleModelSelect}
                />
              )}
            </div>
          )}
          {gitBranch && (
            <WorkModePill
              workMode={workMode}
              worktreeBranch={worktreeBranch}
            />
          )}
          {gitBranch && (
            <div className={styles.branchPickerAnchor} ref={branchPickerRef}>
              <button
                className={`${styles.branchPill} ${projectDir ? styles.branchPillClickable : ''}`}
                onClick={openBranchPicker}
                title="Switch branch"
              >
                <BranchIcon />
                {gitBranch}
                {projectDir && <ChevronIcon open={branchPickerOpen} />}
              </button>
              {branchPickerOpen && (
                <BranchPickerDropdown
                  branches={branches}
                  filter={branchFilter}
                  onFilterChange={setBranchFilter}
                  filterRef={branchFilterRef}
                  loading={branchLoading}
                  currentBranch={gitBranch}
                  onSelect={handleCheckout}
                  onClose={() => setBranchPickerOpen(false)}
                />
              )}
            </div>
          )}
          <span className={styles.toolbarSpacer} />
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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  )
}

function ProviderIcon({ provider }: { provider?: ProviderId }) {
  const src = provider === 'codex' ? codexIcon : claudeIcon
  const alt = provider === 'codex' ? 'Codex' : 'Claude'
  return (
    <img
      src={src}
      alt={alt}
      width={14}
      height={14}
      className={styles.providerIcon}
    />
  )
}

function formatModelLabel(provider: ProviderId | undefined, label: string): string {
  if (provider === 'codex') return label.toUpperCase()
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
}

function BranchIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'none' }}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

function OpenChevronIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

function BranchPickerDropdown({
  branches,
  filter,
  onFilterChange,
  filterRef,
  loading,
  currentBranch,
  onSelect,
  onClose,
}: {
  branches: GitBranch[]
  filter: string
  onFilterChange: (v: string) => void
  filterRef: React.RefObject<HTMLInputElement>
  loading: boolean
  currentBranch: string
  onSelect: (name: string) => void
  onClose: () => void
}) {
  const filtered = filter
    ? branches.filter((b) => b.name.toLowerCase().includes(filter.toLowerCase()))
    : branches

  // Sort: current first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    if (a.isCurrent && !b.isCurrent) return -1
    if (!a.isCurrent && b.isCurrent) return 1
    return a.name.localeCompare(b.name)
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
  }

  return (
    <div className={styles.branchDropdown} onKeyDown={handleKeyDown}>
      <div className={styles.branchSearchRow}>
        <input
          ref={filterRef}
          className={styles.branchSearchInput}
          type="text"
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter branches..."
          autoFocus
        />
      </div>
      <div className={styles.branchList}>
        {loading && <div className={styles.branchListEmpty}>Loading...</div>}
        {!loading && sorted.length === 0 && (
          <div className={styles.branchListEmpty}>No branches found</div>
        )}
        {!loading &&
          sorted.map((b) => (
            <button
              key={b.name}
              className={`${styles.branchItem} ${b.name === currentBranch ? styles.branchItemCurrent : ''}`}
              onClick={() => {
                if (b.name !== currentBranch) onSelect(b.name)
                else onClose()
              }}
            >
              <BranchIcon />
              <span className={styles.branchItemName}>{b.name}</span>
              {b.name === currentBranch && <span className={styles.branchItemCheck}>✓</span>}
            </button>
          ))}
      </div>
    </div>
  )
}

function WorkModePill({
  workMode,
  worktreeBranch
}: {
  workMode: WorkMode
  worktreeBranch?: string | null
}) {
  const isWorktree = workMode === 'worktree'

  return (
    <div className={styles.workModeAnchor}>
      <div
        className={`${styles.workModePill} ${isWorktree ? styles.workModeWorktree : ''}`}
        title={isWorktree ? `Worktree: ${worktreeBranch || 'active'}` : 'Local project'}
      >
        {isWorktree ? <WorktreeIcon /> : <LocalIcon />}
        {isWorktree ? 'Worktree' : 'Local'}
      </div>
    </div>
  )
}

function LocalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  )
}

function WorktreeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M12 15V9" />
      <path d="M8.5 7.5L11 10" />
      <path d="M15.5 7.5L13 10" />
    </svg>
  )
}

function ModelPickerDropdown({
  models,
  currentModel,
  provider,
  onSelect
}: {
  models: { id: ModelId; label: string }[]
  currentModel: ModelId
  provider: ProviderId
  onSelect: (model: ModelId) => void
}) {
  return (
    <div className={styles.modelDropdown}>
      {models.map((entry) => {
        const selected = entry.id === currentModel
        return (
          <button
            key={entry.id}
            type="button"
            className={`${styles.modelOption} ${selected ? styles.modelOptionActive : ''}`}
            onClick={() => onSelect(entry.id)}
          >
            <span>{formatModelLabel(provider, entry.label)}</span>
            {selected && <span className={styles.modelOptionCheck}>✓</span>}
          </button>
        )
      })}
    </div>
  )
}
