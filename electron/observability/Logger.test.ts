import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Logger } from './Logger'

const tempDirs: string[] = []

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hydra-logger-'))
  tempDirs.push(dir)
  return dir
}

describe('Logger', () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('writes structured json logs', () => {
    const dir = makeTempDir()
    const logger = new Logger({ logDir: dir, defaultService: 'main' })
    logger.info('test.event', {
      traceId: 'trace-123',
      message: 'hello world',
      agentId: 'agent-1',
      meta: { ok: true }
    })

    const lines = readFileSync(logger.getLogPath(), 'utf-8')
      .split('\n')
      .filter(Boolean)
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0]) as Record<string, unknown>
    expect(parsed.event).toBe('test.event')
    expect(parsed.traceId).toBe('trace-123')
    expect(parsed.agentId).toBe('agent-1')
    expect(parsed.level).toBe('info')
  })

  it('rotates files when exceeding size limit', () => {
    const dir = makeTempDir()
    const logger = new Logger({
      logDir: dir,
      defaultService: 'main',
      maxFileBytes: 220,
      maxRotatedFiles: 2
    })

    for (let i = 0; i < 40; i++) {
      logger.info('rotate.event', {
        message: `line-${i}`,
        meta: { index: i, payload: 'x'.repeat(16) }
      })
    }

    const files = logger.getAllLogPathsNewestFirst()
    expect(files.length).toBeGreaterThan(1)

    const recent = logger.readRecentLines(5)
    expect(recent.length).toBeGreaterThan(0)
    const last = JSON.parse(recent[recent.length - 1]) as Record<string, unknown>
    expect(last.event).toBe('rotate.event')
  })
})
