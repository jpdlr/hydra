import type { FsSearchResult } from '@shared/types'
import { getFileIcon } from './fileIcons'
import styles from './FileTree.module.css'

interface FileTreeFilterResultsProps {
  results: FsSearchResult[]
  activeFilePath: string | null
  onOpenFile: (path: string) => void
}

export function FileTreeFilterResults({
  results,
  activeFilePath,
  onOpenFile
}: FileTreeFilterResultsProps) {
  if (results.length === 0) {
    return <div className={styles.empty}>No matches</div>
  }

  return (
    <div className={styles.tree}>
      {results.map((result) => {
        const isActive = activeFilePath === result.path
        const dir = result.path.slice(0, result.path.length - result.name.length)

        return (
          <button
            key={result.path}
            className={`${styles.filterResultNode} ${isActive ? styles.nodeActive : ''}`}
            onClick={() => onOpenFile(result.path)}
            title={result.path}
          >
            <span className={styles.icon}>{getFileIcon(result)}</span>
            <span className={styles.name}>{result.name}</span>
            {dir && <span className={styles.filterResultPath}>{dir}</span>}
          </button>
        )
      })}
    </div>
  )
}
