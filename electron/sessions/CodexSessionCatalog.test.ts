import { afterEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CodexSessionCatalog } from './CodexSessionCatalog'

const tempDirs: string[] = []

function makeSessionsRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hydra-codex-session-catalog-'))
  tempDirs.push(dir)
  return dir
}

describe('CodexSessionCatalog', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads codex session files and filters by project prefix', () => {
    const sessionsRoot = makeSessionsRoot()
    const dayDir = join(sessionsRoot, '2026', '03', '08')
    mkdirSync(dayDir, { recursive: true })

    writeFileSync(
      join(dayDir, 'rollout-a.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-03-08T10:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-a',
            timestamp: '2026-03-08T10:00:00.000Z',
            cwd: '/Users/jp/Documents/Personal/GitHub Projects/hydra',
            git: { branch: 'main' }
          }
        }),
        JSON.stringify({
          timestamp: '2026-03-08T10:00:02.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Hydra Codex, session restarts is not working correctly.'
          }
        })
      ].join('\n'),
      'utf-8'
    )

    writeFileSync(
      join(dayDir, 'rollout-b.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-03-08T09:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-b',
            timestamp: '2026-03-08T09:00:00.000Z',
            cwd: '/Users/jp/Documents/Other Project',
            git: { branch: 'feature/other' }
          }
        }),
        JSON.stringify({
          timestamp: '2026-03-08T09:00:02.000Z',
          type: 'event_msg',
          payload: {
            type: 'user_message',
            message: 'Other project prompt'
          }
        })
      ].join('\n'),
      'utf-8'
    )

    const catalog = new CodexSessionCatalog(sessionsRoot)
    const sessions = catalog.listSessions({
      projectPathPrefix: '/Users/jp/Documents/Personal/GitHub Projects/hydra'
    })

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: 'codex-session-a',
      projectPath: '/Users/jp/Documents/Personal/GitHub Projects/hydra',
      firstPrompt: 'Hydra Codex, session restarts is not working correctly.',
      gitBranch: 'main'
    })
  })

  it('extracts prompt text from response_item user messages when needed', () => {
    const sessionsRoot = makeSessionsRoot()
    const dayDir = join(sessionsRoot, '2026', '03', '08')
    mkdirSync(dayDir, { recursive: true })

    writeFileSync(
      join(dayDir, 'rollout-c.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-03-08T12:00:00.000Z',
          type: 'session_meta',
          payload: {
            id: 'codex-session-c',
            timestamp: '2026-03-08T12:00:00.000Z',
            cwd: '/tmp/project'
          }
        }),
        JSON.stringify({
          timestamp: '2026-03-08T12:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: 'Resume the previous Codex thread.' }
            ]
          }
        })
      ].join('\n'),
      'utf-8'
    )

    const catalog = new CodexSessionCatalog(sessionsRoot)
    const sessions = catalog.listSessions()

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      sessionId: 'codex-session-c',
      firstPrompt: 'Resume the previous Codex thread.'
    })
  })
})
