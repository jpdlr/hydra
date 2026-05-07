import { Suspense, lazy, useEffect, useRef, useCallback } from 'react'
import type { OnMount, OnChange } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { THEME_MAP } from '../../lib/monacoThemes'
import styles from './CodeEditor.module.css'

// Lazy-load Monaco to avoid blocking the main bundle
const Editor = lazy(() =>
  import('@monaco-editor/react').then((mod) => ({ default: mod.Editor }))
)

interface CodeEditorProps {
  filePath: string | null
  content: string
  theme: string
  onChange: (value: string) => void
  onSave: () => void
}

const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  mdx: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  sql: 'sql',
  graphql: 'graphql',
  xml: 'xml',
  svg: 'xml'
}

function getLanguage(path: string | null): string {
  if (!path) return 'plaintext'
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? EXT_TO_LANG[ext] ?? 'plaintext' : 'plaintext'
}

export function CodeEditor({ filePath, content, theme, onChange, onSave }: CodeEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null)

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco

      // Register all custom themes
      for (const [, themeEntry] of Object.entries(THEME_MAP)) {
        monaco.editor.defineTheme(themeEntry.name, themeEntry.data)
      }

      // Apply current theme
      const current = THEME_MAP[theme]
      if (current) {
        monaco.editor.setTheme(current.name)
      }

      // Cmd+S to save
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSave()
      })

      // Cmd+E: route to the app-level toggle instead of Monaco's "Add selection
      // to next find match" so the editor toggle hotkey still works while focus
      // is inside Monaco.
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
        window.dispatchEvent(new CustomEvent('hydra:toggle-editor'))
      })

      editor.focus()
    },
    [theme, onSave]
  )

  // Sync theme changes
  useEffect(() => {
    if (!monacoRef.current) return
    const current = THEME_MAP[theme]
    if (current) {
      monacoRef.current.editor.setTheme(current.name)
    }
  }, [theme])

  const handleChange: OnChange = useCallback(
    (value) => {
      if (value !== undefined) {
        onChange(value)
      }
    },
    [onChange]
  )

  if (!filePath) {
    return (
      <div className={styles.placeholder}>
        <span>Select a file to edit</span>
      </div>
    )
  }

  return (
    <div className={styles.wrapper}>
      <Suspense
        fallback={<div className={styles.placeholder}><span>Loading editor...</span></div>}
      >
        <Editor
          height="100%"
          language={getLanguage(filePath)}
          value={content}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            fontSize: 13,
            fontFamily: 'var(--font-mono)',
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            smoothScrolling: true,
            cursorSmoothCaretAnimation: 'on',
            padding: { top: 8 },
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: {
              verticalScrollbarSize: 8,
              horizontalScrollbarSize: 8
            }
          }}
        />
      </Suspense>
    </div>
  )
}
