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
})
