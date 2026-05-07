import { useMemo } from 'react'
import { MultiFileDiff } from '@pierre/diffs/react'
import type { DiffsThemeNames } from '@pierre/diffs'
import styles from './PierreDiffViewer.module.css'

interface PierreDiffViewerProps {
  original: string
  modified: string
  language: string
  theme: string
  filePath: string
}

function mapTheme(theme: string): DiffsThemeNames {
  switch (theme) {
    case 'light':
      return 'github-light'
    case 'midnight':
      return 'github-dark-default'
    case 'dark':
    default:
      return 'github-dark-dimmed'
  }
}

export function PierreDiffViewer({
  original,
  modified,
  theme,
  filePath
}: PierreDiffViewerProps) {
  const oldFile = useMemo(
    () => ({ name: filePath, contents: original }),
    [filePath, original]
  )
  const newFile = useMemo(
    () => ({ name: filePath, contents: modified }),
    [filePath, modified]
  )

  const options = useMemo(
    () => ({ theme: mapTheme(theme) }),
    [theme]
  )

  return (
    <div className={styles.wrapper}>
      <MultiFileDiff
        oldFile={oldFile}
        newFile={newFile}
        options={options}
        className={styles.diff}
      />
    </div>
  )
}
