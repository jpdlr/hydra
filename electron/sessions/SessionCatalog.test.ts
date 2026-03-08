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
    writeFileSync(join(projectDir, 'session-new.jsonl'), '', 'utf-8')
    writeFileSync(join(projectDir, 'session-old.jsonl'), '', 'utf-8')

    writeFileSync(
      join(projectDir, 'sessions-index.json'),
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace',
          entries: [
            {
              sessionId: 'session-new',
              fullPath: join(projectDir, 'session-new.jsonl'),
              projectPath: '/Users/jp/workspace/ep_inventory',
              firstPrompt: 'Newest',
              modified: '2026-01-05T10:00:00.000Z'
            },
            {
              sessionId: 'session-old',
              fullPath: join(projectDir, 'session-old.jsonl'),
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

  it('extracts the first meaningful prompt from structured jsonl content', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-structured')
    mkdirSync(projectDir, { recursive: true })

    const sessionId = 'structured-session'
    writeFileSync(
      join(projectDir, `${sessionId}.jsonl`),
      [
        JSON.stringify({
          sessionId,
          cwd: '/Users/jp/workspace/hydra',
          gitBranch: 'feature/session-fix',
          isSidechain: false
        }),
        JSON.stringify({
          type: 'user',
          isMeta: true,
          message: {
            role: 'user',
            content: '<local-command-caveat>ignore me</local-command-caveat>'
          }
        }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: '<command-name>/clear</command-name>\n<command-message>clear</command-message>'
          }
        }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Resume the invoice workflow and fix the restart mapping.' },
              { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } }
            ]
          }
        })
      ].join('\n'),
      'utf-8'
    )

    const catalog = new SessionCatalog(projectsRoot)
    const sessions = catalog.listSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId,
      firstPrompt: 'Resume the invoice workflow and fix the restart mapping.'
    })
  })

  it('ignores stale index entries whose transcript file is gone and falls back to jsonl', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-stale-index')
    mkdirSync(projectDir, { recursive: true })

    const sessionId = 'stale-session'
    writeFileSync(
      join(projectDir, 'sessions-index.json'),
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace/stale',
          entries: [
            {
              sessionId,
              fullPath: '/tmp/does-not-exist/stale-session.jsonl',
              projectPath: '/Users/jp/workspace/stale',
              firstPrompt: 'Wrong stale prompt',
              modified: '2026-01-15T10:00:00.000Z'
            }
          ]
        },
        null,
        2
      ),
      'utf-8'
    )

    writeFileSync(
      join(projectDir, `${sessionId}.jsonl`),
      [
        JSON.stringify({
          sessionId,
          cwd: '/Users/jp/workspace/stale/live',
          gitBranch: 'main',
          isSidechain: false
        }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: 'Live prompt from the transcript file'
          }
        })
      ].join('\n'),
      'utf-8'
    )

    const catalog = new SessionCatalog(projectsRoot)
    const sessions = catalog.listSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId,
      projectPath: '/Users/jp/workspace/stale/live',
      firstPrompt: 'Live prompt from the transcript file'
    })
  })

  it('refreshes meta index prompts from the transcript header when available', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-index-refresh')
    mkdirSync(projectDir, { recursive: true })

    const sessionId = 'indexed-session'
    const fullPath = join(projectDir, `${sessionId}.jsonl`)
    writeFileSync(
      fullPath,
      [
        JSON.stringify({
          sessionId,
          cwd: '/Users/jp/workspace/index-refresh',
          gitBranch: 'feature/resume',
          isSidechain: false
        }),
        JSON.stringify({
          type: 'user',
          isMeta: true,
          message: {
            role: 'user',
            content: '<local-command-caveat>ignore me</local-command-caveat>'
          }
        }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'text', text: 'Continue the real work from this resumed session.' }
            ]
          }
        })
      ].join('\n'),
      'utf-8'
    )

    writeFileSync(
      join(projectDir, 'sessions-index.json'),
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace/index-refresh',
          entries: [
            {
              sessionId,
              fullPath,
              projectPath: '/Users/jp/workspace/index-refresh',
              firstPrompt: '<command-name>/clear</command-name>',
              modified: '2026-01-16T10:00:00.000Z'
            }
          ]
        },
        null,
        2
      ),
      'utf-8'
    )

    const catalog = new SessionCatalog(projectsRoot)
    const sessions = catalog.listSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId,
      firstPrompt: 'Continue the real work from this resumed session.',
      gitBranch: 'feature/resume'
    })
  })

  it('caches scans and refreshes via forceRefresh or explicit invalidation', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-cache')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'cache-a.jsonl'), '', 'utf-8')
    writeFileSync(join(projectDir, 'cache-b.jsonl'), '', 'utf-8')
    writeFileSync(join(projectDir, 'cache-c.jsonl'), '', 'utf-8')

    const indexPath = join(projectDir, 'sessions-index.json')
    writeFileSync(
      indexPath,
      JSON.stringify(
        {
          originalPath: '/Users/jp/workspace/cache',
          entries: [
            {
              sessionId: 'cache-a',
              fullPath: join(projectDir, 'cache-a.jsonl'),
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
              fullPath: join(projectDir, 'cache-a.jsonl'),
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Alpha',
              modified: '2026-01-10T10:00:00.000Z'
            },
            {
              sessionId: 'cache-b',
              fullPath: join(projectDir, 'cache-b.jsonl'),
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
              fullPath: join(projectDir, 'cache-a.jsonl'),
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Alpha',
              modified: '2026-01-10T10:00:00.000Z'
            },
            {
              sessionId: 'cache-b',
              fullPath: join(projectDir, 'cache-b.jsonl'),
              projectPath: '/Users/jp/workspace/cache',
              firstPrompt: 'Beta',
              modified: '2026-01-11T10:00:00.000Z'
            },
            {
              sessionId: 'cache-c',
              fullPath: join(projectDir, 'cache-c.jsonl'),
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

  it('matches project prefixes across slash styles', () => {
    const projectsRoot = makeProjectsRoot()
    const projectDir = join(projectsRoot, 'project-prefix')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'session-win-path.jsonl'), '', 'utf-8')

    writeFileSync(
      join(projectDir, 'sessions-index.json'),
      JSON.stringify(
        {
          originalPath: 'C:\\Users\\jp\\workspace',
          entries: [
            {
              sessionId: 'session-win-path',
              fullPath: join(projectDir, 'session-win-path.jsonl'),
              projectPath: 'C:\\Users\\jp\\workspace\\ep_inventory',
              firstPrompt: 'Windows path',
              modified: '2026-01-20T10:00:00.000Z'
            }
          ]
        },
        null,
        2
      ),
      'utf-8'
    )

    const catalog = new SessionCatalog(projectsRoot)
    const filtered = catalog.listSessions({
      projectPathPrefix: 'C:/Users/jp/workspace/ep_'
    })
    expect(filtered.map((entry) => entry.sessionId)).toEqual(['session-win-path'])
  })
})
