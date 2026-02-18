import { Suspense, lazy, useEffect, useRef, useCallback } from 'react'
import type { DiffOnMount } from '@monaco-editor/react'
import { THEME_MAP } from '../../lib/monacoThemes'
import styles from './MonacoDiffViewer.module.css'

const DiffEditor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.DiffEditor }))
)

interface MonacoDiffViewerProps {
  original: string
  modified: string
  language: string
  theme: string
  filePath: string
}

export function MonacoDiffViewer({ original, modified, language, theme }: MonacoDiffViewerProps) {
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)

  const handleMount: DiffOnMount = useCallback(
    (editor, monaco) => {
      void editor // editor ref available if needed later
      monacoRef.current = monaco
      for (const [, entry] of Object.entries(THEME_MAP)) {
        monaco.editor.defineTheme(entry.name, entry.data)
      }
      const current = THEME_MAP[theme]
      if (current) monaco.editor.setTheme(current.name)
    },
    [theme]
  )

  useEffect(() => {
    if (!monacoRef.current) return
    const current = THEME_MAP[theme]
    if (current) monacoRef.current.editor.setTheme(current.name)
  }, [theme])

  return (
    <div className={styles.wrapper}>
      <Suspense fallback={<div className={styles.loading}>Loading diff viewer...</div>}>
        <DiffEditor
          height="100%"
          original={original}
          modified={modified}
          language={language}
          onMount={handleMount}
          options={{
            readOnly: true,
            fontSize: 13,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            renderSideBySide: true,
            enableSplitViewResizing: true,
            renderOverviewRuler: false,
            padding: { top: 8 },
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8,
            },
          }}
        />
      </Suspense>
    </div>
  )
}
