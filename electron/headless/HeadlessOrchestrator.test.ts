import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { HeadlessRun } from '@shared/types'
import { HeadlessOrchestrator } from './HeadlessOrchestrator'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hydra-headless-'))
  tempDirs.push(dir)
  return dir
}

describe('HeadlessOrchestrator', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('hydrates persisted runs and supports list filtering + log tail', () => {
    const baseDir = makeTempDir()
    const run: HeadlessRun = {
      id: 'run12345',
      prompt: 'Build inventory dashboard',
      projectDir: '/tmp/ep_inventory',
      model: 'sonnet',
      resumeSessionId: null,
      status: 'completed',
      startedAt: '2026-02-07T10:00:00.000Z',
      endedAt: '2026-02-07T10:03:00.000Z',
      sessionId: 'session-abc',
      error: null
    }

    writeFileSync(
      join(baseDir, `${run.id}.meta.json`),
      JSON.stringify({ schemaVersion: 1, run }, null, 2),
      'utf-8'
    )
    writeFileSync(
      join(baseDir, `${run.id}.jsonl`),
      ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n'),
      'utf-8'
    )

    const orchestrator = new HeadlessOrchestrator(baseDir)
    const listed = orchestrator.list()
    expect(listed.map((entry) => entry.id)).toContain('run12345')

    const filtered = orchestrator.list({ query: 'inventory', status: 'completed' })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('run12345')

    const log = orchestrator.getLog('run12345', { tailLines: 2, maxChars: 1000 })
    expect(log).toMatchObject({
      runId: 'run12345',
      totalLines: 5,
      returnedLines: 2,
      truncated: true
    })
    expect(log?.content).toBe('line4\nline5')
  })

  it('backfills legacy log files without metadata', () => {
    const baseDir = makeTempDir()
    const runId = 'legacy001'
    writeFileSync(
      join(baseDir, `${runId}.jsonl`),
      [
        JSON.stringify({ session_id: 'legacy-session-1' }),
        JSON.stringify({ type: 'message', text: 'hello' })
      ].join('\n'),
      'utf-8'
    )

    const orchestrator = new HeadlessOrchestrator(baseDir)
    const run = orchestrator.get(runId)
    expect(run).not.toBeNull()
    expect(run?.sessionId).toBe('legacy-session-1')
    expect(run?.prompt).toBe('(legacy run)')
    expect(run?.status).toBe('completed')
  })
})
