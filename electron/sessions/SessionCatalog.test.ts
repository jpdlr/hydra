import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SessionCatalog } from './SessionCatalog'

const tempDirs: string[] = []

function makeProjectsRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hydra-session-catalog-'))
  tempDirs.push(dir)
  return dir
}

describe('SessionCatalog', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads sessions-index entries and applies hidden/prefix filtering', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-a')
    mkdirSync(projectDir, { recursive: true })

    writeFileSync(
      join(projectDir, 'sessions-index.json'),
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace',
          entries: [
            {
              sessionId: 'session-new',
              fullPath: '/tmp/session-new.jsonl',
              projectPath: '/Users/jp/workspace/ep_inventory',
              firstPrompt: 'Newest',
              modified: '2026-01-05T10:00:00.000Z'
            },
            {
              sessionId: 'session-old',
              fullPath: '/tmp/session-old.jsonl',
              projectPath: '/Users/jp/workspace/drug_module',
              firstPrompt: 'Older',
              modified: '2026-01-02T10:00:00.000Z'
            }
          ]
        },
        null,
        2
      ),
      'utf-8'
    )

    const catalog = new SessionCatalog(projectsRoot)
    const all = catalog.listSessions()
    expect(all.map((entry) => entry.sessionId)).toEqual(['session-new', 'session-old'])

    const filtered = catalog.listSessions({
      hiddenSessionIds: ['session-old'],
      projectPathPrefix: '/Users/jp/workspace/ep_'
    })
    expect(filtered.map((entry) => entry.sessionId)).toEqual(['session-new'])
  })

  it('falls back to jsonl headers when sessions-index is missing', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-b')
    mkdirSync(projectDir, { recursive: true })

    const sessionId = 'fallback-session'
    const jsonlPath = join(projectDir, `${sessionId}.jsonl`)
    writeFileSync(
      jsonlPath,
      [
        JSON.stringify({
          sessionId,
          cwd: '/Users/jp/workspace/ep_inventory',
          gitBranch: 'feature/grid',
          isSidechain: false
        }),
        JSON.stringify({
          message: {
            role: 'user',
            content: 'Bring in a delete button'
          }
        })
      ].join('\n'),
      'utf-8'
    )

    const catalog = new SessionCatalog(projectsRoot)
    const sessions = catalog.listSessions({ limit: 1 })

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId,
      projectPath: '/Users/jp/workspace/ep_inventory',
      gitBranch: 'feature/grid',
      firstPrompt: 'Bring in a delete button'
    })
  })

  it('caches scans and refreshes via forceRefresh or explicit invalidation', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-cache')
    mkdirSync(projectDir, { recursive: true })

    const indexPath = join(projectDir, 'sessions-index.json')
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace/cache',
          entries: [
            {
              sessionId: 'cache-a',
              fullPath: '/tmp/cache-a.jsonl',
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Alpha',
              modified: '2026-01-10T10:00:00.000Z'
            }
          ]
        },
        null,
        2
      )
    )

    const catalog = new SessionCatalog(projectsRoot, 60000)
    const first = catalog.listSessions()
    expect(first.map((entry) => entry.sessionId)).toEqual(['cache-a'])

    // Update index with a new session while cache is still valid.
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace/cache',
          entries: [
            {
              sessionId: 'cache-a',
              fullPath: '/tmp/cache-a.jsonl',
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Alpha',
              modified: '2026-01-10T10:00:00.000Z'
            },
            {
              sessionId: 'cache-b',
              fullPath: '/tmp/cache-b.jsonl',
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Beta',
              modified: '2026-01-11T10:00:00.000Z'
            }
          ]
        },
        null,
        2
      )
    )

    const stillCached = catalog.listSessions()
    expect(stillCached.map((entry) => entry.sessionId)).toEqual(['cache-a'])

    const forced = catalog.listSessions({ forceRefresh: true })
    expect(forced.map((entry) => entry.sessionId)).toEqual(['cache-b', 'cache-a'])

    // Add third entry, then invalidate cache to force refresh on next read without flag.
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace/cache',
          entries: [
            {
              sessionId: 'cache-a',
              fullPath: '/tmp/cache-a.jsonl',
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Alpha',
              modified: '2026-01-10T10:00:00.000Z'
            },
            {
              sessionId: 'cache-b',
              fullPath: '/tmp/cache-b.jsonl',
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Beta',
              modified: '2026-01-11T10:00:00.000Z'
            },
            {
              sessionId: 'cache-c',
              fullPath: '/tmp/cache-c.jsonl',
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Gamma',
              modified: '2026-01-12T10:00:00.000Z'
            }
          ]
        },
        null,
        2
      )
    )
    catalog.invalidateCache()
    const afterInvalidation = catalog.listSessions()
    expect(afterInvalidation.map((entry) => entry.sessionId)).toEqual(['cache-c', 'cache-b', 'cache-a'])
  })
})
