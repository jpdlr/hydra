/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readTranscriptHistory } from './TranscriptReader'

describe('readTranscriptHistory', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reads Claude transcript history from project JSONL files', () => {
    const root = mkdtempSync(join(tmpdir(), 'hydra-transcript-claude-'))
    tempRoots.push(root)

    const projectsDir = join(root, '.claude', 'projects', 'demo')
    mkdirSync(projectsDir, { recursive: true })
    writeFileSync(
      join(projectsDir, 'session-claude.jsonl'),
      [
        JSON.stringify({
          type: 'user',
          timestamp: '2026-03-21T10:00:00.000Z',
          message: {
            role: 'user',
            content: [{ type: 'text', text: 'Summarize the repo.' }]
          }
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-03-21T10:00:10.000Z',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Here is the summary.' }]
          }
        })
      ].join('\n')
    )

    expect(
      readTranscriptHistory('session-claude', 'claude', 50, { claudeProjectsDir: join(root, '.claude', 'projects') })
    ).toEqual([
      { role: 'user', text: 'Summarize the repo.', timestamp: '2026-03-21T10:00:00.000Z' },
      { role: 'assistant', text: 'Here is the summary.', timestamp: '2026-03-21T10:00:10.000Z' }
    ])
  })

  it('reads Codex transcript history from codex session JSONL files', () => {
    const root = mkdtempSync(join(tmpdir(), 'hydra-transcript-codex-'))
    tempRoots.push(root)

    const sessionsDir = join(root, '.codex', 'sessions', '2026', '03', '21')
    mkdirSync(sessionsDir, { recursive: true })
    writeFileSync(
      join(sessionsDir, 'rollout-2026-03-21T10-00-00-session-codex.jsonl'),
      [
        JSON.stringify({
          timestamp: '2026-03-21T10:00:00.000Z',
          type: 'event_msg',
          payload: { type: 'user_message', message: 'Fix the remote chat history.' }
        }),
        JSON.stringify({
          timestamp: '2026-03-21T10:00:05.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'I found the root cause.' }]
          }
        }),
        JSON.stringify({
          timestamp: '2026-03-21T10:00:10.000Z',
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: 'Patch it.' }]
          }
        }),
        JSON.stringify({
          timestamp: '2026-03-21T10:00:15.000Z',
          type: 'event_msg',
          payload: { type: 'agent_message', message: 'Patched and verified.' }
        })
      ].join('\n')
    )

    expect(
      readTranscriptHistory('session-codex', 'codex', 50, { codexSessionsDir: join(root, '.codex', 'sessions') })
    ).toEqual([
      { role: 'user', text: 'Fix the remote chat history.', timestamp: '2026-03-21T10:00:00.000Z' },
      { role: 'assistant', text: 'I found the root cause.', timestamp: '2026-03-21T10:00:05.000Z' },
      { role: 'user', text: 'Patch it.', timestamp: '2026-03-21T10:00:10.000Z' },
      { role: 'assistant', text: 'Patched and verified.', timestamp: '2026-03-21T10:00:15.000Z' }
    ])
  })
})
